"""Table definitions shared with migration 0006."""

import sqlalchemy as sa

from retail_api.imports.schema_v1 import precise_timestamp

metadata = sa.MetaData()
accuracy_checks = sa.Table(
    "forecast_accuracy_checks",
    metadata,
    sa.Column("id", sa.Uuid(), primary_key=True),
    sa.Column("commodity", sa.Unicode(80), nullable=False),
    sa.Column("region", sa.String(7), nullable=False),
    sa.Column("transaction_version", sa.Integer(), nullable=False),
    sa.Column("product_version", sa.Integer(), nullable=False),
    sa.Column("model_version", sa.String(40), nullable=False),
    sa.Column("checked_at", precise_timestamp, nullable=False),
    sa.Column("status", sa.String(24), nullable=False),
    sa.Column("evidence", sa.UnicodeText(), nullable=False),
)
sa.Index(
    "ix_forecast_accuracy_scope",
    accuracy_checks.c.commodity,
    accuracy_checks.c.region,
    accuracy_checks.c.transaction_version,
    accuracy_checks.c.product_version,
    accuracy_checks.c.checked_at,
)
