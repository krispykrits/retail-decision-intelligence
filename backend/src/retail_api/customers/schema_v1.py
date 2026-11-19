"""Frozen SQL table definitions for migration 0005."""

import sqlalchemy as sa

metadata = sa.MetaData()

model_runs = sa.Table(
    "customer_model_runs",
    metadata,
    sa.Column("id", sa.Uuid, primary_key=True),
    sa.Column("model", sa.String(8), nullable=False),
    sa.Column("as_of", sa.Date, nullable=False),
    sa.Column("trained_at", sa.DateTime, nullable=False),
    sa.Column("transaction_version", sa.Integer, nullable=False),
    sa.Column("household_version", sa.Integer, nullable=False),
    sa.Column("evidence", sa.UnicodeText, nullable=False),
    sa.Column("artifact_uri", sa.Unicode(1024)),
)
sa.Index(
    "ix_customer_model_runs_latest", model_runs.c.model, model_runs.c.as_of, model_runs.c.trained_at
)

predictions = sa.Table(
    "customer_model_predictions",
    metadata,
    sa.Column("run_id", sa.Uuid, sa.ForeignKey(model_runs.c.id), primary_key=True),
    sa.Column("household_id", sa.String(32), primary_key=True),
    sa.Column("region", sa.String(7)),
    sa.Column("loyalty_flag", sa.String(1)),
    sa.Column("age_range", sa.Unicode(80)),
    sa.Column("household_size", sa.Unicode(80)),
    sa.Column("last_purchase", sa.Date, nullable=False),
    sa.Column("purchase_days_180d", sa.Integer, nullable=False),
    sa.Column("observed_spend_180d", sa.Numeric(19, 4), nullable=False),
    sa.Column("eligible", sa.Boolean, nullable=False),
    sa.Column("forecast", sa.Float),
)
