import hashlib
import logging
from collections.abc import Iterator
from datetime import UTC, datetime
from itertools import batched
from typing import Any, BinaryIO
from uuid import UUID, uuid4

import sqlalchemy as sa

from retail_api.imports.csv_source import InvalidCSV, csv_rows
from retail_api.imports.schema_v1 import (
    dataset_state,
    households,
    import_errors,
    import_files,
    import_runs,
    products,
    stages,
    tables,
    transactions,
)
from retail_api.imports.schemas import (
    Dataset,
    DatasetSummary,
    ImportErrorRow,
    ImportResult,
    ImportStatus,
    SourceWindow,
)

BATCH_SIZE = 5_000
HISTORY_LIMIT = 20
ERROR_PREVIEW = 20
DUPLICATE = "Already stored"
CONFLICT = "ID already exists with different values."
logger = logging.getLogger(__name__)


class ImportUnavailable(RuntimeError):
    pass


def sha256(file: BinaryIO) -> str:
    digest = hashlib.sha256()
    while chunk := file.read(1024 * 1024):
        digest.update(chunk)
    file.seek(0)
    return digest.hexdigest()


def stage_rows(
    connection: sa.Connection, stage: sa.Table, rows: Iterator[dict[str, object]]
) -> None:
    for batch in batched(rows, BATCH_SIZE):
        connection.execute(
            stage.insert(),
            [{column.name: row.get(column.name) for column in stage.columns} for row in batch],
        )


def classify_natural_keys(connection: sa.Connection, stage: sa.Table, table: sa.Table) -> None:
    key = next(iter(table.primary_key.columns)).name
    ranked = (
        sa.select(
            stage.c.row_number,
            sa.func.first_value(stage.c.row_hash)
            .over(partition_by=stage.c[key], order_by=stage.c.row_number)
            .label("first_hash"),
            sa.func.row_number()
            .over(partition_by=stage.c[key], order_by=stage.c.row_number)
            .label("occurrence"),
        )
        .where(stage.c.reason.is_(None))
        .subquery()
    )
    stored_hash = sa.select(table.c.row_hash).where(table.c[key] == stage.c[key]).scalar_subquery()
    connection.execute(
        stage.update()
        .where(stage.c.row_number == ranked.c.row_number)
        .values(
            reason=sa.case(
                (stored_hash == stage.c.row_hash, DUPLICATE),
                (stored_hash.is_not(None), CONFLICT),
                (ranked.c.first_hash != stage.c.row_hash, CONFLICT),
                (ranked.c.occurrence > 1, DUPLICATE),
            )
        )
    )


def classify_transactions(connection: sa.Connection, stage: sa.Table) -> None:
    missing_household = ~sa.exists().where(households.c.household_id == stage.c.household_id)
    missing_product = ~sa.exists().where(products.c.product_id == stage.c.product_id)
    connection.execute(
        stage.update()
        .where(stage.c.reason.is_(None), sa.or_(missing_household, missing_product))
        .values(
            reason=sa.case(
                (missing_household, "Household ID is missing from stored households."),
                else_="Product ID is missing from stored products.",
            )
        )
    )
    # Match repeated rows by occurrence as well as content, preserving their multiplicity.
    ranked = (
        sa.select(
            stage.c.row_number,
            sa.func.row_number()
            .over(partition_by=stage.c.row_hash, order_by=stage.c.row_number)
            .label("occurrence"),
        )
        .where(stage.c.reason.is_(None))
        .subquery()
    )
    stored_count = (
        sa.select(sa.func.max(transactions.c.occurrence))
        .where(transactions.c.row_hash == stage.c.row_hash)
        .scalar_subquery()
    )
    connection.execute(
        stage.update()
        .where(stage.c.row_number == ranked.c.row_number)
        .values(
            occurrence=ranked.c.occurrence,
            reason=sa.case((ranked.c.occurrence <= stored_count, DUPLICATE)),
        )
    )


def commit_file(
    connection: sa.Connection,
    dataset: Dataset,
    file: BinaryIO,
    result: ImportResult,
    file_hash: str,
) -> None:
    stage, table = stages[dataset], tables[dataset]
    stage_rows(connection, stage, csv_rows(file, dataset))
    if dataset is Dataset.TRANSACTIONS:
        classify_transactions(connection, stage)
    else:
        classify_natural_keys(connection, stage, table)
    for reason, count in connection.execute(
        sa.select(stage.c.reason, sa.func.count()).group_by(stage.c.reason)
    ):
        result.processed += count
        if reason is None:
            result.inserted = count
        elif reason == DUPLICATE:
            result.duplicates_skipped = count
        elif reason == CONFLICT:
            result.conflicts = count
        else:
            result.rejected += count
    if result.conflicts or result.rejected:
        result.status = ImportStatus.COMPLETED_WITH_ERRORS
    record_result(connection, result, file_hash)
    if result.inserted:
        columns = [column.name for column in table.columns if column.name in stage.c]
        selected = sa.select(*(stage.c[name] for name in columns))
        if dataset is Dataset.TRANSACTIONS:
            columns.extend(["import_id", "source_row"])
            selected = selected.add_columns(
                sa.literal(result.import_id, type_=sa.Uuid()), stage.c.row_number
            )
        connection.execute(
            table.insert().from_select(columns, selected.where(stage.c.reason.is_(None)))
        )
    connection.execute(
        import_errors.insert().from_select(
            ["import_id", "row_number", "reason"],
            sa.select(
                sa.literal(result.import_id, type_=sa.Uuid()), stage.c.row_number, stage.c.reason
            ).where(stage.c.reason.is_not(None), stage.c.reason != DUPLICATE),
        )
    )
    connection.execute(stage.delete())


def record_result(connection: sa.Connection, result: ImportResult, file_hash: str) -> None:
    connection.execute(
        import_runs.insert().values(
            id=result.import_id,
            status=result.status,
            finished_at=result.finished_at.replace(tzinfo=None),
            processed=result.processed,
            inserted=result.inserted,
            duplicates_skipped=result.duplicates_skipped,
            conflicts=result.conflicts,
            rejected=result.rejected,
            detail=result.detail,
        )
    )
    connection.execute(
        import_files.insert().values(
            import_id=result.import_id,
            dataset=result.dataset,
            filename=result.filename,
            sha256=file_hash,
        )
    )


def import_csv(engine: sa.Engine, dataset: Dataset, filename: str, file: BinaryIO) -> ImportResult:
    file_hash = sha256(file)
    result = ImportResult(
        import_id=uuid4(),
        dataset=dataset,
        filename=filename,
        status=ImportStatus.COMPLETED,
        finished_at=datetime.now(UTC),
        processed=0,
        inserted=0,
        duplicates_skipped=0,
        conflicts=0,
        rejected=0,
        errors=[],
    )
    try:
        with engine.begin() as connection:
            if connection.dialect.name == "mssql":
                driver: Any = connection.connection.driver_connection
                driver.timeout = 90
            state = dataset_state.c.dataset == dataset
            # Hold the dataset's write lock through staging, classification and commit.
            connection.execute(
                dataset_state.update().where(state).values(version=dataset_state.c.version)
            )
            previous_count = connection.scalar(
                sa.select(import_runs.c.processed)
                .select_from(import_files.join(import_runs))
                .where(
                    import_files.c.dataset == dataset,
                    import_files.c.sha256 == file_hash,
                    import_runs.c.status == ImportStatus.COMPLETED,
                )
                .limit(1)
            )
            if previous_count is None:
                commit_file(connection, dataset, file, result, file_hash)
            else:
                result.processed = result.duplicates_skipped = previous_count
                record_result(connection, result, file_hash)

            result.finished_at = datetime.now(UTC)
            finished = result.finished_at.replace(tzinfo=None)
            connection.execute(
                import_runs.update()
                .where(import_runs.c.id == result.import_id)
                .values(finished_at=finished)
            )
            versions: dict[str, object] = {
                "version": dataset_state.c.version + int(result.inserted > 0)
            }
            if result.status is ImportStatus.COMPLETED or result.inserted:
                versions["last_success"] = finished
            connection.execute(dataset_state.update().where(state).values(**versions))
            result.errors = error_preview(connection, result.import_id)
    except (InvalidCSV, sa.exc.SQLAlchemyError) as error:
        result.status = ImportStatus.FAILED
        result.finished_at = datetime.now(UTC)
        result.processed = result.inserted = result.duplicates_skipped = 0
        result.conflicts = result.rejected = 0
        result.errors = []
        result.detail = (
            str(error)
            if isinstance(error, InvalidCSV)
            else ("The database could not confirm this import. Retrying the same file is safe.")
        )
        if isinstance(error, sa.exc.SQLAlchemyError):
            logger.warning("Import %s failed (%s)", result.import_id, type(error).__name__)
        try:
            with engine.begin() as connection:
                saved = read_import(connection, result.import_id)
                if saved:
                    return saved
                record_result(connection, result, file_hash)
        except sa.exc.SQLAlchemyError as unavailable:
            raise ImportUnavailable(result.detail) from unavailable
    return result


def error_preview(connection: sa.Connection, import_id: UUID) -> list[ImportErrorRow]:
    return [
        ImportErrorRow(row_number=row.row_number, reason=row.reason)
        for row in connection.execute(
            sa.select(import_errors.c.row_number, import_errors.c.reason)
            .where(import_errors.c.import_id == import_id)
            .order_by(import_errors.c.row_number)
            .limit(ERROR_PREVIEW)
        )
    ]


def import_query() -> sa.Select[tuple[object, ...]]:
    return sa.select(
        import_runs.c.id.label("import_id"),
        *(column for column in import_runs.c if column.name != "id"),
        import_files.c.dataset,
        import_files.c.filename,
    ).select_from(import_runs.join(import_files))


def import_result(connection: sa.Connection, row: sa.RowMapping) -> ImportResult:
    return ImportResult.model_validate(
        {
            **row,
            "finished_at": row["finished_at"].replace(tzinfo=UTC),
            "errors": error_preview(connection, row["import_id"]),
        }
    )


def read_import(connection: sa.Connection, import_id: UUID) -> ImportResult | None:
    row = connection.execute(import_query().where(import_runs.c.id == import_id)).mappings().first()
    return import_result(connection, row) if row else None


def import_history(connection: sa.Connection) -> list[ImportResult]:
    rows = connection.execute(
        import_query()
        .order_by(import_runs.c.finished_at.desc(), import_runs.c.id)
        .limit(HISTORY_LIMIT)
    ).mappings()
    return [import_result(connection, row) for row in rows]


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
            sa.select(dataset_state, metrics)
            .select_from(dataset_state.join(metrics, sa.true()))
            .where(dataset_state.c.dataset == dataset)
        ).one()
        result.append(
            DatasetSummary(
                dataset=dataset,
                records=row.records,
                source_window=SourceWindow(start=row.start, end=row.end) if row.start else None,
                last_success=row.last_success.replace(tzinfo=UTC) if row.last_success else None,
                version=row.version,
            )
        )
    return result
