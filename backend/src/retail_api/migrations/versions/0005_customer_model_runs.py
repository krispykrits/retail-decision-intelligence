"""Store versioned evaluations, observed snapshots and materialized predictions."""

from alembic import op

from retail_api.customers.schema_v1 import metadata

revision = "0005_customer_model_runs"
down_revision = "0004_csv_import_jobs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    metadata.create_all(op.get_bind(), checkfirst=False)


def downgrade() -> None:
    metadata.drop_all(op.get_bind(), checkfirst=False)
