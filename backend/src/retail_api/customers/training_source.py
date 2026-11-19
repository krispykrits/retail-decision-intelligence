"""SQL reads used to build offline customer model features."""

from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

import sqlalchemy as sa
from sqlalchemy.engine import Connection

from retail_api.imports.schema_v1 import households, transactions


@dataclass(frozen=True)
class Profile:
    loyalty_flag: str | None
    age_range: str | None
    household_size: str | None


@dataclass(frozen=True)
class PurchaseDay:
    household_id: str
    purchase_date: date
    store_region: str
    spend: Decimal
    units: int


def transaction_bounds(db: Connection) -> tuple[date | None, date | None]:
    c = transactions.c
    first, last = db.execute(
        sa.select(sa.func.min(c.purchase_date), sa.func.max(c.purchase_date))
    ).one()
    return first, last


def household_profiles(db: Connection) -> dict[str, Profile]:
    # These fields describe published cohorts and are excluded from model features.
    return {
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


def purchase_days(db: Connection, through: date) -> Iterator[PurchaseDay]:
    c = transactions.c
    positive_units = sa.func.sum(sa.cast(sa.case((c.units > 0, c.units), else_=0), sa.BigInteger))
    query = (
        sa.select(
            c.household_id,
            c.purchase_date,
            c.store_region,
            sa.func.sum(c.spend).label("spend"),
            positive_units.label("units"),
        )
        .where(c.purchase_date <= through)
        .group_by(c.household_id, c.purchase_date, c.store_region)
        .order_by(c.household_id, c.purchase_date, c.store_region)
    )
    for row in db.execute(query):
        yield PurchaseDay(
            row.household_id, row.purchase_date, row.store_region, row.spend, row.units
        )
