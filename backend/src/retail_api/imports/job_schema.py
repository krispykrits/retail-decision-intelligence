"""Durable upload and queue state, separate from the outcome of an import."""

import sqlalchemy as sa
from sqlalchemy.dialects.mssql import DATETIME2

metadata = sa.MetaData()
timestamp = sa.DateTime().with_variant(DATETIME2(precision=6), "mssql")  # type: ignore[no-untyped-call]

jobs = sa.Table(
    "csv_import_jobs",
    metadata,
    sa.Column("id", sa.Uuid(), primary_key=True),
    sa.Column("dataset", sa.String(16), nullable=False),
    sa.Column("filename", sa.Unicode(120), nullable=False),
    sa.Column("size_bytes", sa.Integer(), nullable=False),
    sa.Column("created_at", timestamp, nullable=False),
    sa.Column("queued_at", timestamp, nullable=True),
    sa.Column("started_at", timestamp, nullable=True),
)
