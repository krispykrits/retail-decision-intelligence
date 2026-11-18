"""Track durable CSV uploads and jobs."""

from alembic import op

from retail_api.imports.job_schema import metadata

revision = "0004_csv_import_jobs"
down_revision = "0003_retail_imports"
branch_labels = None
depends_on = None


def upgrade() -> None:
    metadata.create_all(op.get_bind(), checkfirst=False)


def downgrade() -> None:
    metadata.drop_all(op.get_bind(), checkfirst=False)
