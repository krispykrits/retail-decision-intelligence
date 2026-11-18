"""Coordinate direct CSV uploads across the SQL job store, blob storage, and queue."""

from contextlib import closing
from uuid import UUID, uuid4

from sqlalchemy.engine import Connection, Engine

from retail_api.config import Settings
from retail_api.imports import jobs
from retail_api.imports.schemas import ImportJob, ImportJobStatus, ImportUpload, StartImportUpload
from retail_api.imports.storage import ImportStorage


class ImportJobNotFound(LookupError):
    pass


class UploadSizeMismatch(ValueError):
    pass


def get_status(connection: Connection, import_id: UUID) -> ImportJob:
    row = jobs.get_job(connection, import_id)
    if row is None:
        raise ImportJobNotFound(import_id)
    return jobs.job_status(connection, row)


def start_upload(
    engine: Engine, settings: Settings, upload: StartImportUpload, filename: str
) -> ImportUpload:
    import_id = uuid4()
    with closing(ImportStorage(settings)) as storage:
        url = storage.upload_url(import_id)
    with engine.begin() as connection:
        jobs.create_job(connection, import_id, upload, filename)
    return ImportUpload(import_id=import_id, upload_url=url)


def submit_upload(engine: Engine, settings: Settings, import_id: UUID) -> ImportJob:
    with engine.connect() as connection:
        row = jobs.get_job(connection, import_id)
        if row is None:
            raise ImportJobNotFound(import_id)
        status = jobs.job_status(connection, row)
        if status.status != ImportJobStatus.AWAITING_UPLOAD:
            return status
        expected_size = row.size_bytes

    with closing(ImportStorage(settings)) as storage:
        if storage.blob(import_id).get_blob_properties().size != expected_size:
            raise UploadSizeMismatch(import_id)
        # Send first. Retrying after a lost response is safe because the import ID
        # identifies one committed outcome, even if the queue delivers it twice.
        storage.queue.send_message(str(import_id), time_to_live=-1)

    with engine.begin() as connection:
        jobs.mark_queued(connection, import_id)
        return get_status(connection, import_id)
