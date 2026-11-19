from bisect import bisect_right
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from itertools import groupby

from sqlalchemy.engine import Connection

from retail_api.customers.definition import HISTORY_DAYS, HORIZONS
from retail_api.customers.schemas import ModelType
from retail_api.customers.training_source import (
    Profile,
    household_profiles,
    purchase_days,
    transaction_bounds,
)

FEATURE_WINDOWS = (30, 90, HISTORY_DAYS)
FEATURES = {
    "recency": "Days since the last positive-unit purchase at the cutoff",
    **{
        f"{field}_{days}d": f"{description} in the {days} days ending at the cutoff"
        for days in FEATURE_WINDOWS
        for field, description in (
            ("net_spend", "Net spend including returns"),
            ("purchase_days", "Distinct days with a positive-unit purchase"),
            ("purchase_units", "Positive units purchased"),
        )
    },
}


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
        short, medium, long = (self.window(end, days) for days in FEATURE_WINDOWS)
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
class History:
    ledgers: dict[str, Ledger]
    profiles: dict[str, Profile]
    first_date: date | None
    last_date: date | None


def load_history(db: Connection, as_of: date | None) -> History:
    first, last = transaction_bounds(db)
    if not first or not last:
        return History({}, {}, first, last)
    profiles = household_profiles(db)
    ledgers: dict[str, Ledger] = {}
    for (household_id, day), rows in groupby(
        purchase_days(db, as_of or last), key=lambda row: (row.household_id, row.purchase_date)
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
