from bisect import bisect_right
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

import sqlalchemy as sa
from sqlalchemy.engine import Connection

from retail_api.customers.definition import HISTORY_DAYS, HORIZONS
from retail_api.customers.schemas import ModelType
from retail_api.imports.schema_v1 import households, transactions


@dataclass
class Ledger:
    days: list[int] = field(default_factory=list)
    spend: list[Decimal] = field(default_factory=lambda: [Decimal(0)])
    purchase_days: list[int] = field(default_factory=lambda: [0])
    units: list[int] = field(default_factory=lambda: [0])
    purchase_dates: list[int] = field(default_factory=list)
    regions: list[str] = field(default_factory=list)

    def append(self, day: int, spend: Decimal, units: int, region: str) -> None:
        self.days.append(day)
        self.spend.append(self.spend[-1] + spend)
        self.purchase_days.append(self.purchase_days[-1] + int(units > 0))
        self.units.append(self.units[-1] + units)
        if units > 0:
            self.purchase_dates.append(day)
            self.regions.append(region)

    def window(self, end: int, days: int) -> tuple[Decimal, int, int]:
        left = bisect_right(self.days, end - days)
        right = bisect_right(self.days, end)
        return (
            self.spend[right] - self.spend[left],
            self.purchase_days[right] - self.purchase_days[left],
            self.units[right] - self.units[left],
        )

    def observe(self, cutoff: date) -> "Observation | None":
        end = cutoff.toordinal()
        last = bisect_right(self.purchase_dates, end) - 1
        if last < 0:
            return None
        recency = end - self.purchase_dates[last]
        short, medium, long = (self.window(end, days) for days in (30, 90, HISTORY_DAYS))
        return Observation(
            last_purchase=date.fromordinal(self.purchase_dates[last]),
            region=self.regions[last],
            eligible=recency < HISTORY_DAYS,
            spend=long[0],
            purchase_days=long[1],
            baseline_spend=float(medium[0]),
            features=(
                float(recency),
                *(float(value) for group in (short, medium, long) for value in group),
            ),
        )

    def label(self, cutoff: date, model: ModelType) -> float:
        horizon = HORIZONS[model]
        spend, purchase_days, _ = self.window(cutoff.toordinal() + horizon, horizon)
        return float(spend) if model is ModelType.CLV else float(purchase_days == 0)


@dataclass(frozen=True)
class Observation:
    last_purchase: date
    region: str
    eligible: bool
    spend: Decimal
    purchase_days: int
    baseline_spend: float
    features: tuple[float, ...]


@dataclass(frozen=True)
class Profile:
    loyalty_flag: str | None
    age_range: str | None
    household_size: str | None


@dataclass(frozen=True)
class History:
    ledgers: dict[str, Ledger]
    profiles: dict[str, Profile]
    first_date: date | None
    last_date: date | None


def load_history(db: Connection, as_of: date | None) -> History:
    c = transactions.c
    first, last = db.execute(
        sa.select(sa.func.min(c.purchase_date), sa.func.max(c.purchase_date))
    ).one()
    if not first or not last:
        return History({}, {}, first, last)
    # The lookup records an observed cohort and never enters the estimator.
    profiles = {
        row.household_id: Profile(row.loyalty_flag, row.age_range, row.household_size)
        for row in db.execute(
            sa.select(
                households.c.household_id,
                households.c.loyalty_flag,
                households.c.age_range,
                households.c.household_size,
            )
        )
    }
    positive_units = sa.func.sum(sa.cast(sa.case((c.units > 0, c.units), else_=0), sa.BigInteger))
    query = (
        sa.select(
            c.household_id,
            c.purchase_date,
            c.store_region,
            sa.func.sum(c.spend).label("spend"),
            positive_units.label("units"),
        )
        .where(c.purchase_date <= (as_of or last))
        .group_by(c.household_id, c.purchase_date, c.store_region)
        .order_by(c.household_id, c.purchase_date, c.store_region)
    )
    ledgers: dict[str, Ledger] = {}
    from itertools import groupby

    for (household_id, day), rows in groupby(
        db.execute(query), key=lambda row: (row.household_id, row.purchase_date)
    ):
        by_region = list(rows)
        region = max(by_region, key=lambda row: row.units).store_region
        if household_id not in ledgers:
            ledgers[household_id] = Ledger()
        ledgers[household_id].append(
            day.toordinal(),
            sum((row.spend for row in by_region), Decimal(0)),
            sum(row.units for row in by_region),
            region,
        )
    return History(ledgers, profiles, first, last)
