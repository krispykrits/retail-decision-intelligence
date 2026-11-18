"""Table definitions shared with migration 0003. Keep this version frozen."""

from collections.abc import Callable
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects.mssql import DATETIME2

from retail_api.imports.schemas import Dataset

metadata = sa.MetaData()
identifier = sa.String(32)
precise_timestamp = sa.DateTime().with_variant(
    DATETIME2(precision=6),  # type: ignore[no-untyped-call]
    "mssql",
)
household_fields: dict[str, sa.types.TypeEngine[str]] = {
    "loyalty_flag": sa.String(1),
    "age_range": sa.Unicode(80),
    "marital_status": sa.Unicode(80),
    "income_range": sa.Unicode(80),
    "homeowner": sa.Unicode(80),
    "household_composition": sa.Unicode(80),
    "household_size": sa.Unicode(80),
    "children": sa.Unicode(80),
}
product_fields: dict[str, sa.types.TypeEngine[str]] = {
    "department": sa.Unicode(80),
    "commodity": sa.Unicode(80),
    "brand_type": sa.Unicode(80),
    "natural_organic_flag": sa.String(1),
}


def attributes(
    fields: dict[str, sa.types.TypeEngine[str]], *, nullable: bool
) -> list[sa.Column[Any]]:
    return [sa.Column(name, kind, nullable=nullable) for name, kind in fields.items()]


def household_columns() -> list[sa.Column[Any]]:
    return [
        sa.Column("household_id", identifier, primary_key=True),
        sa.Column("loyalty_flag", sa.String(1), nullable=False),
        *attributes(
            {name: kind for name, kind in household_fields.items() if name != "loyalty_flag"},
            nullable=True,
        ),
    ]


def product_columns() -> list[sa.Column[Any]]:
    return [
        sa.Column("product_id", identifier, primary_key=True),
        *attributes(product_fields, nullable=False),
    ]


def transaction_columns() -> list[sa.Column[Any]]:
    return [
        sa.Column("basket_id", identifier, nullable=False),
        sa.Column("household_id", identifier, nullable=False),
        sa.Column("purchase_date", sa.Date(), nullable=False),
        sa.Column("product_id", identifier, nullable=False),
        sa.Column("spend", sa.Numeric(14, 4), nullable=False),
        sa.Column("units", sa.Integer(), nullable=False),
        sa.Column("store_region", sa.String(7), nullable=False),
        sa.Column("week_number", sa.SmallInteger(), nullable=False),
        sa.Column("year", sa.SmallInteger(), nullable=False),
    ]


def digest() -> sa.Column[str]:
    return sa.Column("row_hash", sa.String(64), nullable=False)


households = sa.Table("households", metadata, *household_columns(), digest())
products = sa.Table("products", metadata, *product_columns(), digest())
transactions = sa.Table(
    "transactions",
    metadata,
    sa.Column("line_id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), primary_key=True),
    *transaction_columns(),
    digest(),
    sa.Column("occurrence", sa.Integer(), nullable=False),
    sa.Column("import_id", sa.Uuid(), sa.ForeignKey("import_files.import_id"), nullable=False),
    sa.Column("source_row", sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(["household_id"], ["households.household_id"]),
    sa.ForeignKeyConstraint(["product_id"], ["products.product_id"]),
    sa.UniqueConstraint("row_hash", "occurrence", name="uq_transaction_source_line"),
)
sa.Index(
    "ix_transactions_household_date", transactions.c.household_id, transactions.c.purchase_date
)
sa.Index("ix_transactions_purchase_date", transactions.c.purchase_date)

dataset_state = sa.Table(
    "dataset_state",
    metadata,
    sa.Column("dataset", sa.String(16), primary_key=True),
    sa.Column("version", sa.Integer(), nullable=False),
    sa.Column("last_success", precise_timestamp, nullable=True),
)
import_runs = sa.Table(
    "import_runs",
    metadata,
    sa.Column("id", sa.Uuid(), primary_key=True),
    sa.Column("status", sa.String(24), nullable=False),
    sa.Column("finished_at", precise_timestamp, nullable=False),
    sa.Column("processed", sa.Integer(), nullable=False),
    sa.Column("inserted", sa.Integer(), nullable=False),
    sa.Column("duplicates_skipped", sa.Integer(), nullable=False),
    sa.Column("conflicts", sa.Integer(), nullable=False),
    sa.Column("rejected", sa.Integer(), nullable=False),
    sa.Column("detail", sa.String(160), nullable=True),
)
sa.Index("ix_import_runs_finished_at", import_runs.c.finished_at)
import_files = sa.Table(
    "import_files",
    metadata,
    sa.Column("import_id", sa.Uuid(), sa.ForeignKey("import_runs.id"), primary_key=True),
    sa.Column("dataset", sa.String(16), nullable=False),
    sa.Column("filename", sa.Unicode(255), nullable=False),
    sa.Column("sha256", sa.String(64), nullable=False),
)
sa.Index("ix_import_files_dataset_sha256", import_files.c.dataset, import_files.c.sha256)
import_errors = sa.Table(
    "import_errors",
    metadata,
    sa.Column("import_id", sa.Uuid(), sa.ForeignKey("import_runs.id"), primary_key=True),
    sa.Column("row_number", sa.Integer(), primary_key=True),
    sa.Column("reason", sa.String(160), nullable=False),
)


def stage_table(dataset: Dataset, columns: Callable[[], list[sa.Column[Any]]]) -> sa.Table:
    fields = columns()
    for column in fields:
        column.primary_key = False
        column.nullable = True  # Invalid rows only carry a row number and reason.
    return sa.Table(
        f"stage_{dataset.value}",
        metadata,
        sa.Column("row_number", sa.Integer(), primary_key=True, autoincrement=False),
        sa.Column("row_hash", sa.String(64)),
        sa.Column("occurrence", sa.Integer()),
        sa.Column("reason", sa.String(160)),
        *fields,
    )


tables = {
    Dataset.HOUSEHOLDS: households,
    Dataset.PRODUCTS: products,
    Dataset.TRANSACTIONS: transactions,
}
stages = {
    Dataset.HOUSEHOLDS: stage_table(Dataset.HOUSEHOLDS, household_columns),
    Dataset.PRODUCTS: stage_table(Dataset.PRODUCTS, product_columns),
    Dataset.TRANSACTIONS: stage_table(Dataset.TRANSACTIONS, transaction_columns),
}
