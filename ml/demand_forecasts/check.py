"""Run and save forecast accuracy checks."""

import argparse
import logging
from collections import Counter
from datetime import UTC, datetime
from uuid import uuid4

import sqlalchemy as sa
from sqlalchemy.engine import Engine

from ml.demand_forecasts.backtest import MODEL_VERSION, backtest
from retail_api.config import Settings
from retail_api.database import create_database_engine
from retail_api.forecasts.queries import COMMODITY, REGION, DemandQueries
from retail_api.forecasts.schema_v1 import accuracy_checks
from retail_api.forecasts.schemas import AccuracyEvidence, CheckStatus
from retail_api.imports.queries import transaction_product_versions

logger = logging.getLogger(__name__)


def run_check(
    engine: Engine, commodity: str, region: str | None, versions: tuple[int, int]
) -> CheckStatus:
    with engine.connect() as db:
        queries = DemandQueries(db, commodity, region)
        coverage, units = queries.weekly_history()
        start, end = coverage.first_complete_week, coverage.last_complete_week_end
        recorded = queries.recorded_weeks(start, end) if start and end else set()
        if transaction_product_versions(db) != versions:
            raise RuntimeError("Purchase data changed while loading. Run the check again.")

    try:
        evidence = backtest(
            start, coverage.complete_weeks, recorded, units, coverage.weeks_with_purchases
        )
    except (ArithmeticError, ValueError):
        logger.exception("Demand backtest failed for %s / %s", commodity, region or "all regions")
        evidence = AccuracyEvidence(
            status="failed", reason="The accuracy check could not finish. Run it again."
        )

    check_id = uuid4()
    with engine.begin() as db:
        if transaction_product_versions(db) != versions:
            raise RuntimeError("Purchase data changed during the check. Run the check again.")
        db.execute(
            accuracy_checks.insert().values(
                id=check_id,
                commodity=commodity,
                region=region or "",
                transaction_version=versions[0],
                product_version=versions[1],
                model_version=MODEL_VERSION,
                checked_at=datetime.now(UTC).replace(tzinfo=None),
                status=evidence.status,
                evidence=evidence.model_dump_json(),
            )
        )
    print(
        f"{commodity} / {region or 'all regions'}: {check_id} {evidence.status} — {evidence.reason}"
    )
    return evidence.status


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    scope = parser.add_mutually_exclusive_group(required=True)
    scope.add_argument("--commodity")
    scope.add_argument("--all-commodities", action="store_true", help="Check every commodity.")
    parser.add_argument("--region", help="Omit to use all regions together.")
    args = parser.parse_args()
    engine = create_database_engine(Settings(), query_timeout=60)
    try:
        with engine.connect() as db:
            versions = transaction_product_versions(db)
            commodities = list(db.scalars(sa.select(COMMODITY).distinct().order_by(COMMODITY)))
            if args.commodity and args.commodity not in commodities:
                parser.error("Choose a recorded commodity.")
            if args.region and not db.scalar(
                sa.select(REGION).where(REGION == args.region).limit(1)
            ):
                parser.error("Choose a recorded region.")
            if not commodities:
                parser.error("Import product data before running a check.")
            columns = accuracy_checks.c
            prior = set()
            if args.all_commodities:
                prior = set(
                    db.scalars(
                        sa.select(columns.commodity)
                        .distinct()
                        .where(
                            columns.region == (args.region or ""),
                            columns.transaction_version == versions[0],
                            columns.product_version == versions[1],
                            columns.model_version == MODEL_VERSION,
                            columns.status.in_(("completed", "insufficient_history")),
                        )
                    )
                )
        counts = Counter(
            run_check(engine, commodity, args.region, versions)
            for commodity in ([args.commodity] if args.commodity else commodities)
            if commodity not in prior
        )
        if args.all_commodities:
            print(
                f"{counts['completed']} completed, {counts['insufficient_history']} insufficient "
                f"history, {counts['failed']} failed, {len(prior)} already checked."
            )
        return int(counts["failed"] > 0)
    except RuntimeError as error:
        parser.exit(1, f"{error}\n")
    finally:
        engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
