"""Run and save a forecast accuracy check for one commodity and region."""

import argparse
import logging
from datetime import UTC, datetime
from uuid import uuid4

import sqlalchemy as sa

from ml.demand_forecasts.backtest import MODEL_VERSION, backtest
from retail_api.config import Settings
from retail_api.database import create_database_engine
from retail_api.forecasts.queries import COMMODITY, REGION, DemandQueries
from retail_api.forecasts.schema_v1 import accuracy_checks
from retail_api.forecasts.schemas import AccuracyEvidence
from retail_api.imports.queries import transaction_product_versions

logger = logging.getLogger(__name__)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--commodity", required=True)
    parser.add_argument("--region", help="Omit to include all regions.")
    args = parser.parse_args()
    engine = create_database_engine(Settings(), query_timeout=60)
    try:
        with engine.connect() as db:
            versions = transaction_product_versions(db)
            if not db.scalar(sa.select(COMMODITY).where(COMMODITY == args.commodity).limit(1)):
                parser.error("Choose a recorded commodity.")
            if args.region and not db.scalar(
                sa.select(REGION).where(REGION == args.region).limit(1)
            ):
                parser.error("Choose a recorded region.")
            queries = DemandQueries(db, args.commodity, args.region)
            coverage, units = queries.weekly_history()
            start, end = coverage.first_complete_week, coverage.last_complete_week_end
            recorded = queries.recorded_weeks(start, end) if start and end else set()
            if transaction_product_versions(db) != versions:
                parser.error("Purchase data changed while loading. Run the check again.")

        try:
            evidence = backtest(
                start, coverage.complete_weeks, recorded, units, coverage.weeks_with_purchases
            )
        except (ArithmeticError, ValueError):
            logger.exception("Demand backtest failed")
            evidence = AccuracyEvidence(
                status="failed", reason="The accuracy check could not finish. Run it again."
            )

        check_id = uuid4()
        with engine.begin() as db:
            if transaction_product_versions(db) != versions:
                parser.error("Purchase data changed during the check. Run the check again.")
            db.execute(
                accuracy_checks.insert().values(
                    id=check_id,
                    commodity=args.commodity,
                    region=args.region or "",
                    transaction_version=versions[0],
                    product_version=versions[1],
                    model_version=MODEL_VERSION,
                    checked_at=datetime.now(UTC).replace(tzinfo=None),
                    status=evidence.status,
                    evidence=evidence.model_dump_json(),
                )
            )
        print(f"{check_id} {evidence.status} — {evidence.reason}")
        return int(evidence.status == "failed")
    finally:
        engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
