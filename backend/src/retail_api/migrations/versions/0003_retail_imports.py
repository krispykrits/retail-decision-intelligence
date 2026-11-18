"""Retail data and additive import tracking."""

from alembic import op

from retail_api.imports.schema_v1 import metadata

revision = "0003_retail_imports"
down_revision = "0002_accounts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    metadata.create_all(op.get_bind(), checkfirst=False)


def downgrade() -> None:
    metadata.drop_all(op.get_bind(), checkfirst=False)
