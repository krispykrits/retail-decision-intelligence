from bisect import bisect_right
from datetime import date, timedelta
from decimal import Decimal
from itertools import groupby

import sqlalchemy as sa
from sqlalchemy.engine import Connection

from retail_api.customers.definition import HISTORY_DAYS
from retail_api.customers.schema_v1 import predictions
from retail_api.customers.schemas import (
    EngagementCounts,
    EngagementPoint,
    EngagementSegment,
    ModelEvidence,
    RetentionFilters,
    RetentionHousehold,
    RetentionOverview,
    ShoppingSegment,
)
from retail_api.customers.training_source import (
    household_profiles,
    purchase_days,
    transaction_bounds,
)

ACTIVE_DAYS = 90
TREND_MONTHS = 6


def activity(days_ago: int | None) -> str:
    if days_ago is None:
        return "no_purchase"
    if days_ago <= ACTIVE_DAYS:
        return "active"
    if days_ago <= HISTORY_DAYS:
        return "at_risk"
    return "inactive"


def month_ends(first: date, last: date) -> list[date]:
    points = [last]
    month = last.replace(day=1)
    for _ in range(TREND_MONTHS):
        end = month - timedelta(days=1)
        if (end - first).days < HISTORY_DAYS - 1:
            break
        points.append(end)
        month = end.replace(day=1)
    return points[::-1]


def overview(
    db: Connection, evidence: ModelEvidence, filters: RetentionFilters
) -> RetentionOverview:
    first, latest = transaction_bounds(db)
    if first is None or latest is None:
        return RetentionOverview(
            evidence=evidence,
            risk_threshold=filters.risk_threshold,
            households=[],
            trend=[],
            segments=[],
        )
    valid_model = evidence.status == "available" and bool(
        evidence.evaluation and evidence.evaluation.eligible
    )
    as_of = evidence.as_of if valid_model and evidence.as_of else latest
    complete = (as_of - first).days >= HISTORY_DAYS - 1
    cutoffs = month_ends(first, as_of) if complete else []
    trend = {cutoff: EngagementCounts() for cutoff in cutoffs}
    profiles = {
        household_id: profile
        for household_id, profile in household_profiles(db).items()
        if all(
            value is None or getattr(profile, field) == value
            for field, value in (
                ("loyalty_flag", filters.loyalty_flag),
                ("age_range", filters.age_range),
                ("household_size", filters.household_size),
            )
        )
    }
    scores: dict[str, float] = {}
    if valid_model:
        c = predictions.c
        scores = dict(
            (row.household_id, row.forecast)
            for row in db.execute(
                sa.select(c.household_id, c.forecast).where(
                    c.run_id == evidence.version, c.eligible.is_(True), c.forecast.is_not(None)
                )
            )
        )
    recent_start = as_of - timedelta(days=ACTIVE_DAYS - 1)
    history_start = as_of - timedelta(days=HISTORY_DAYS - 1)
    prior_spend: dict[str, Decimal] = {}
    prior_days: dict[str, int] = {}
    households: list[RetentionHousehold] = []
    purchase_dates: dict[str, list[date]] = {}
    for household_id, purchases in groupby(
        purchase_days(db, as_of), key=lambda row: row.household_id
    ):
        dates: list[date] = []
        region = None
        recent = previous = Decimal(0)
        for day, entries in groupby(purchases, key=lambda row: row.purchase_date):
            daily = list(entries)
            best = max(daily, key=lambda row: row.units)
            if best.units > 0:
                dates.append(day)
                region = best.store_region
            if day >= recent_start:
                recent += sum((row.spend for row in daily), Decimal(0))
            elif day >= history_start:
                previous += sum((row.spend for row in daily), Decimal(0))
        prior_days[household_id] = sum(history_start <= day < recent_start for day in dates)
        prior_spend[household_id] = previous
        if household_id not in profiles:
            continue
        del profiles[household_id]
        if filters.region and region != filters.region:
            continue
        last_purchase = dates[-1] if dates else None
        recency = (as_of - last_purchase).days if last_purchase else None
        purchase_days_180d = sum(day >= history_start for day in dates)
        households.append(
            RetentionHousehold(
                household_id=household_id,
                segment=ShoppingSegment.OTHER,
                last_purchase=last_purchase,
                recency_days=recency,
                purchase_days_180d=purchase_days_180d,
                net_spend_90d=recent,
                churn_risk=scores.get(household_id),
            )
        )
        purchase_dates[household_id] = dates

    if not filters.region:
        households.extend(
            RetentionHousehold(
                household_id=household_id,
                segment=ShoppingSegment.OTHER,
                last_purchase=None,
                recency_days=None,
                purchase_days_180d=0,
                net_spend_90d=Decimal(0),
            )
            for household_id in profiles
        )

    segments = {segment: EngagementSegment(segment=segment) for segment in ShoppingSegment}
    ranked = sorted(prior_spend, key=lambda key: (-prior_spend[key], key))
    first_quarter = set(ranked[: (len(ranked) + 3) // 4])
    selected = []
    for row in households:
        key = row.household_id
        days = prior_days.get(key, 0)
        if key in first_quarter and days and prior_spend[key] > 0:
            row.segment = ShoppingSegment.HIGHER_SPEND
        elif days >= 6:
            row.segment = ShoppingSegment.FREQUENT
        elif 1 <= days <= 2:
            row.segment = ShoppingSegment.INFREQUENT
        if filters.segment and filters.segment != row.segment:
            continue
        selected.append(row)
        dates = purchase_dates.get(key, [])
        for cutoff, counts in trend.items():
            index = bisect_right(dates, cutoff)
            bucket = activity((cutoff - dates[index - 1]).days if index else None)
            setattr(counts, bucket, getattr(counts, bucket) + 1)
        counts = segments[row.segment]
        bucket = activity(row.recency_days)
        setattr(counts, bucket, getattr(counts, bucket) + 1)

    return RetentionOverview(
        evidence=evidence,
        as_of=as_of,
        history_complete=complete,
        households=selected,
        segments=[row for key, row in segments.items() if filters.segment in (None, key)]
        if complete and selected
        else [],
        trend=[
            EngagementPoint(date=cutoff, **counts.model_dump()) for cutoff, counts in trend.items()
        ],
        risk_threshold=filters.risk_threshold,
    )
