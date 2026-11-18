"""Process one queued CSV in an on-demand Container Apps Job execution."""

import logging
import sys
from tempfile import TemporaryFile
from uuid import UUID

import sqlalchemy as sa
from azure.core import MatchConditions
from azure.core.exceptions import AzureError, ResourceNotFoundError
from azure.storage.queue import QueueMessage

from retail_api.config import Settings
from retail_api.database import create_database_engine
from retail_api.imports import queries, store
from retail_api.imports.jobs import get_job, mark_started, now
from retail_api.imports.schemas import Dataset, ImportResult, ImportStatus
from retail_api.imports.storage import ImportStorage

# Longer than the job execution timeout. On normal errors, release sooner for retry.
VISIBILITY_SECONDS = 1860
MAX_DELIVERIES = 4
logger = logging.getLogger(__name__)


def finish_failed(engine: sa.Engine, row: sa.RowMapping, detail: str) -> None:
    with engine.begin() as connection:
        if queries.read_import(connection, row.id) is not None:
            return
        store.record_result(
            connection,
            ImportResult(
                import_id=row.id,
                dataset=Dataset(row.dataset),
                filename=row.filename,
                status=ImportStatus.FAILED,
                finished_at=now(),
                processed=0,
                inserted=0,
                duplicates_skipped=0,
                conflicts=0,
                rejected=0,
                detail=detail,
                errors=[],
            ),
            "",
        )


def process_message(
    engine: sa.Engine, storage: ImportStorage, settings: Settings, message: QueueMessage
) -> None:
    try:
        import_id = UUID(message.content)
    except ValueError:
        storage.queue.delete_message(message)
        return

    with engine.begin() as connection:
        row = get_job(connection, import_id)
        already_finished = (
            row is not None and queries.read_import(connection, import_id) is not None
        )
        if row is not None and not already_finished:
            mark_started(connection, import_id)
    if row is None or already_finished:
        storage.queue.delete_message(message)
        return

    if (message.dequeue_count or 0) > MAX_DELIVERIES:
        finish_failed(engine, row, "The import could not finish after several attempts.")
        storage.queue.delete_message(message)
        return

    try:
        blob = storage.blob(import_id)
        properties = blob.get_blob_properties()
        if properties.size != row.size_bytes or properties.size > settings.import_max_bytes:
            finish_failed(engine, row, "The uploaded file size does not match the request.")
        else:
            # The file is streamed to disk and the same parser is used as for local uploads.
            with TemporaryFile() as file:
                blob.download_blob(
                    etag=properties.etag, match_condition=MatchConditions.IfNotModified
                ).readinto(file)
                file.seek(0)
                store.import_csv(
                    engine, Dataset(row.dataset), row.filename, file, import_id=import_id
                )
    except ResourceNotFoundError:
        finish_failed(engine, row, "The uploaded file is unavailable. Select it and upload again.")
    except (AzureError, OSError, store.ImportUnavailable) as error:
        logger.warning("Import job %s failed (%s).", import_id, type(error).__name__)
        if (message.dequeue_count or 0) < MAX_DELIVERIES:
            storage.queue.update_message(message, visibility_timeout=30)
            raise
        finish_failed(engine, row, "The import could not finish after several attempts.")

    storage.queue.delete_message(message)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    settings = Settings()
    engine = create_database_engine(settings, connect_timeout=60)
    storage = ImportStorage(settings)
    try:
        message = storage.queue.receive_message(visibility_timeout=VISIBILITY_SECONDS)
        if message is not None:
            process_message(engine, storage, settings, message)
    except (AzureError, OSError, sa.exc.SQLAlchemyError, store.ImportUnavailable) as error:
        logger.error("CSV import job ended with %s.", type(error).__name__)
        sys.exit(1)
    finally:
        storage.close()
        engine.dispose()


if __name__ == "__main__":
    main()
