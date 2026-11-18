from datetime import date, datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel


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
