from datetime import UTC, datetime
from uuid import UUID

import sqlalchemy as sa

from retail_api.imports.job_schema import jobs
from retail_api.imports.schemas import ImportJob, ImportJobStatus, StartImportUpload
from retail_api.imports.store import read_import


def now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def get_job(connection: sa.Connection, import_id: UUID) -> sa.RowMapping | None:
    return connection.execute(sa.select(jobs).where(jobs.c.id == import_id)).mappings().first()


def create_job(
    connection: sa.Connection, import_id: UUID, upload: StartImportUpload, filename: str
) -> None:
    connection.execute(
        jobs.insert().values(
            id=import_id,
            dataset=upload.dataset,
            filename=filename,
            size_bytes=upload.size_bytes,
            created_at=now(),
        )
    )


def job_status(connection: sa.Connection, row: sa.RowMapping) -> ImportJob:
    result = read_import(connection, row.id)
    status = ImportJobStatus.AWAITING_UPLOAD
    if result is not None:
        status = ImportJobStatus.FINISHED
    elif row.started_at is not None:
        status = ImportJobStatus.PROCESSING
    elif row.queued_at is not None:
        status = ImportJobStatus.QUEUED
    return ImportJob(import_id=row.id, filename=row.filename, status=status, result=result)
