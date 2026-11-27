"""Store versioned demand forecast accuracy checks."""

from alembic import op

from retail_api.forecasts.schema_v1 import metadata

revision = "0006_forecast_accuracy"
down_revision = "0005_customer_model_runs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    metadata.create_all(op.get_bind(), checkfirst=False)


def downgrade() -> None:
    metadata.drop_all(op.get_bind(), checkfirst=False)
