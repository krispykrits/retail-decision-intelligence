from datetime import date, datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, Field


class Dataset(StrEnum):
    HOUSEHOLDS = "households"
    PRODUCTS = "products"
    TRANSACTIONS = "transactions"


class ImportStatus(StrEnum):
    COMPLETED = "completed"
    COMPLETED_WITH_ERRORS = "completed_with_errors"
    FAILED = "failed"


class ImportErrorRow(BaseModel):
    row_number: int
    reason: str


class ImportResult(BaseModel):
    import_id: UUID
    dataset: Dataset
    filename: str
    status: ImportStatus
    finished_at: datetime
    processed: int
    inserted: int
    duplicates_skipped: int
    conflicts: int
    rejected: int
    detail: str | None = None
    errors: list[ImportErrorRow]


class SourceWindow(BaseModel):
    start: date
    end: date


class DatasetSummary(BaseModel):
    dataset: Dataset
    records: int
    last_success: datetime | None
    source_window: SourceWindow | None
    version: int


class StartImportUpload(BaseModel):
    dataset: Dataset
    filename: str = Field(min_length=1, max_length=255)
    size_bytes: int = Field(gt=0)


class ImportUpload(BaseModel):
    import_id: UUID
    upload_url: str


class ImportJobStatus(StrEnum):
    AWAITING_UPLOAD = "awaiting_upload"
    QUEUED = "queued"
    PROCESSING = "processing"
    FINISHED = "finished"


class ImportJob(BaseModel):
    import_id: UUID
    filename: str
    status: ImportJobStatus
    result: ImportResult | None = None


class ImportCapabilities(BaseModel):
    direct_upload: bool
    max_bytes: int
