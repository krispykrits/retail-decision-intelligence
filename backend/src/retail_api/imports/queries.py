"""Data Operations reads, shared by the API and import workers."""

from collections import defaultdict
from datetime import UTC
from typing import Any
from uuid import UUID

import sqlalchemy as sa

from retail_api.imports.schema_v1 import (
    dataset_state,
    import_errors,
    import_files,
    import_runs,
    tables,
)
from retail_api.imports.schemas import (
    Dataset,
    DatasetSummary,
    ImportErrorRow,
    ImportResult,
    SourceWindow,
)

HISTORY_LIMIT = 20
ERROR_PREVIEW = 20


def preview_query(import_id: UUID) -> sa.Select[tuple[UUID, int, str]]:
    return (
        sa.select(import_errors.c.import_id, import_errors.c.row_number, import_errors.c.reason)
        .where(import_errors.c.import_id == import_id)
        .order_by(import_errors.c.row_number)
        .limit(ERROR_PREVIEW)
    )


def error_preview(connection: sa.Connection, import_id: UUID) -> list[ImportErrorRow]:
    return [
        ImportErrorRow(row_number=row.row_number, reason=row.reason)
        for row in connection.execute(preview_query(import_id))
    ]


def import_query() -> sa.Select[tuple[object, ...]]:
    return sa.select(
        import_runs.c.id.label("import_id"),
        *(column for column in import_runs.c if column.name != "id"),
        import_files.c.dataset,
        import_files.c.filename,
    ).select_from(import_runs.join(import_files))


def import_result(row: sa.RowMapping, errors: list[ImportErrorRow]) -> ImportResult:
    return ImportResult.model_validate(
        {
            **row,
            "finished_at": row["finished_at"].replace(tzinfo=UTC),
            "errors": errors,
        }
    )


def read_import(connection: sa.Connection, import_id: UUID) -> ImportResult | None:
    row = connection.execute(import_query().where(import_runs.c.id == import_id)).mappings().first()
    return import_result(row, error_preview(connection, import_id)) if row else None


def import_history(connection: sa.Connection) -> list[ImportResult]:
    rows = (
        connection.execute(
            import_query()
            .order_by(import_runs.c.finished_at.desc(), import_runs.c.id)
            .limit(HISTORY_LIMIT)
        )
        .mappings()
        .all()
    )
    previews: dict[UUID, list[ImportErrorRow]] = defaultdict(list)
    if rows:
        # Each branch seeks by import ID and reads at most one preview from the error index.
        branches = [sa.select(preview_query(row["import_id"]).subquery()) for row in rows]
        combined = sa.union_all(*branches).subquery()
        for error in connection.execute(sa.select(combined).order_by(combined.c.row_number)):
            previews[error.import_id].append(
                ImportErrorRow(row_number=error.row_number, reason=error.reason)
            )
    return [import_result(row, previews[row["import_id"]]) for row in rows]


def inventory(connection: sa.Connection) -> list[DatasetSummary]:
    result = []
    for dataset, table in tables.items():
        start: sa.ColumnElement[Any] = sa.null()
        end: sa.ColumnElement[Any] = sa.null()
        if dataset is Dataset.TRANSACTIONS:
            start = sa.func.min(table.c.purchase_date)
            end = sa.func.max(table.c.purchase_date)
        metrics = (
            sa.select(sa.func.count().label("records"), start.label("start"), end.label("end"))
            .select_from(table)
            .subquery()
        )
        row = connection.execute(
            sa.select(dataset_state, metrics).select_from(
                metrics.outerjoin(dataset_state, dataset_state.c.dataset == dataset)
            )
        ).one()
        result.append(
            DatasetSummary(
                dataset=dataset,
                records=row.records,
                source_window=SourceWindow(start=row.start, end=row.end) if row.start else None,
                last_success=row.last_success.replace(tzinfo=UTC) if row.last_success else None,
                version=row.version or 0,
            )
        )
    return result
