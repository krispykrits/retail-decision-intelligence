from collections.abc import AsyncGenerator
from typing import Any
from uuid import UUID

from azure.core.exceptions import AzureError, ResourceNotFoundError
from fastapi import APIRouter, HTTPException, Request, Response
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import FormData, UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser

from retail_api.accounts.models import AccountUser
from retail_api.accounts.schemas import ErrorResponse
from retail_api.imports import queries, service, store
from retail_api.imports.schemas import (
    Dataset,
    DatasetSummary,
    ImportCapabilities,
    ImportJob,
    ImportResult,
    ImportUpload,
    StartImportUpload,
)

router = APIRouter(tags=["Data Operations"])
MULTIPART_OVERHEAD = 16 * 1024
AUTH_ERRORS: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorResponse, "description": "Sign in required"},
    403: {"model": ErrorResponse, "description": "Administrator and valid CSRF token required"},
}


def upload_too_large() -> HTTPException:
    return HTTPException(413, "The CSV is larger than the configured upload limit.")


def validate_upload_size(size: int | None, limit: int) -> None:
    if size is None or size > limit:
        raise upload_too_large()


def csv_filename(filename: str) -> str:
    basename = filename.replace("\\", "/").rsplit("/", 1)[-1]
    if not basename.lower().endswith(".csv"):
        raise HTTPException(422, "Choose a CSV file.")
    return basename[:120]


async def limit_body(request: Request, limit: int) -> AsyncGenerator[bytes, None]:
    received = 0
    async for chunk in request.stream():
        received += len(chunk)
        if received > limit:
            raise upload_too_large()
        yield chunk


async def upload_form(request: Request, limit: int) -> FormData:
    if request.headers.get("content-type", "").partition(";")[0].lower() != "multipart/form-data":
        raise HTTPException(415, "Send the dataset and CSV as multipart form data.")
    if request.headers.get("content-length", "").isdigit():
        if int(request.headers["content-length"]) > limit + MULTIPART_OVERHEAD:
            raise upload_too_large()
    try:
        return await MultiPartParser(
            request.headers,
            limit_body(request, limit + MULTIPART_OVERHEAD),
            max_files=1,
            max_fields=1,
            max_part_size=1024,
        ).parse()
    except MultiPartException as error:
        raise HTTPException(400, "Send exactly one dataset and one CSV file.") from error


@router.post(
    "/imports",
    summary="Import a retail CSV",
    description=(
        "Administrators can add rows to one dataset per request. Returns the stored result "
        "when processing finishes. Each file commits its valid new rows together."
    ),
    responses={
        **AUTH_ERRORS,
        400: {"model": ErrorResponse, "description": "Invalid multipart upload"},
        413: {"model": ErrorResponse, "description": "CSV exceeds the configured limit"},
        415: {"model": ErrorResponse, "description": "Multipart form required"},
        422: {"model": ErrorResponse, "description": "Choose a dataset and a CSV file"},
        503: {"model": ErrorResponse, "description": "Import service unavailable"},
    },
    openapi_extra={
        "parameters": [
            {
                "name": "X-CSRF-Token",
                "in": "header",
                "required": True,
                "schema": {"type": "string"},
            }
        ],
        "requestBody": {
            "required": True,
            "content": {
                "multipart/form-data": {
                    "schema": {
                        "type": "object",
                        "required": ["dataset", "file"],
                        "properties": {
                            "dataset": {"type": "string", "enum": list(Dataset)},
                            "file": {"type": "string", "format": "binary"},
                        },
                    }
                }
            },
        },
    },
)
async def create_import(request: Request, response: Response) -> ImportResult:
    settings = request.app.state.settings
    if settings.import_storage_account:
        raise HTTPException(409, "Use a direct upload for this environment.")
    limit: int = settings.import_max_bytes
    form = await upload_form(request, limit)
    try:
        uploaded = form.get("file")
        dataset_name = form.get("dataset")
        if not isinstance(uploaded, UploadFile) or not isinstance(dataset_name, str):
            raise HTTPException(422, "Choose a dataset and a CSV file.")
        try:
            dataset = Dataset(dataset_name)
        except ValueError as error:
            raise HTTPException(422, "Choose Households, Products or Transactions.") from error
        filename = csv_filename(uploaded.filename or "")
        validate_upload_size(uploaded.size, limit)
        engine = request.app.state.database
        response.headers["Cache-Control"] = "no-store"
        return await run_in_threadpool(store.import_csv, engine, dataset, filename, uploaded.file)
    except store.ImportUnavailable as error:
        raise HTTPException(503, str(error)) from error
    finally:
        await form.close()


def require_admin(request: Request) -> None:
    account: AccountUser = request.state.account
    if not account.is_superuser:
        raise HTTPException(403, "Administrator access required")


@router.get("/import-capabilities", responses=AUTH_ERRORS)
def import_capabilities(request: Request) -> ImportCapabilities:
    require_admin(request)
    settings = request.app.state.settings
    return ImportCapabilities(
        direct_upload=bool(settings.import_storage_account), max_bytes=settings.import_max_bytes
    )


@router.post("/import-jobs", response_model=ImportUpload, status_code=201, responses=AUTH_ERRORS)
def start_import_upload(
    upload: StartImportUpload, request: Request, response: Response
) -> ImportUpload:
    require_admin(request)
    settings = request.app.state.settings
    if not settings.import_storage_account:
        raise HTTPException(409, "Direct uploads are unavailable in this environment.")
    validate_upload_size(upload.size_bytes, settings.import_max_bytes)
    filename = csv_filename(upload.filename)

    try:
        result = service.start_upload(request.app.state.database, settings, upload, filename)
    except AzureError as error:
        raise HTTPException(503, "Import storage is temporarily unavailable.") from error
    response.headers["Cache-Control"] = "no-store"
    return result


@router.post("/import-jobs/{import_id}/submit", status_code=202, responses=AUTH_ERRORS)
def submit_import(import_id: UUID, request: Request, response: Response) -> ImportJob:
    require_admin(request)
    settings = request.app.state.settings
    if not settings.import_storage_account:
        raise HTTPException(409, "Direct uploads are unavailable in this environment.")
    response.headers["Cache-Control"] = "no-store"
    try:
        return service.submit_upload(request.app.state.database, settings, import_id)
    except service.ImportJobNotFound as error:
        raise HTTPException(404, "Import not found.") from error
    except service.UploadSizeMismatch as error:
        raise HTTPException(422, "The uploaded file size does not match the request.") from error
    except ResourceNotFoundError as error:
        raise HTTPException(409, "The upload has not finished.") from error
    except AzureError as error:
        raise HTTPException(503, "Import storage is temporarily unavailable.") from error


@router.get("/import-jobs/{import_id}", responses=AUTH_ERRORS)
def get_import_job(import_id: UUID, request: Request, response: Response) -> ImportJob:
    require_admin(request)
    response.headers["Cache-Control"] = "no-store"
    with request.app.state.database.connect() as connection:
        try:
            return service.get_status(connection, import_id)
        except service.ImportJobNotFound as error:
            raise HTTPException(404, "Import not found.") from error


@router.get(
    "/imports",
    summary="List recent imports",
    description="Returns up to 20 recent imports with their counts and row error previews.",
    responses=AUTH_ERRORS,
)
def list_imports(request: Request, response: Response) -> list[ImportResult]:
    require_admin(request)
    response.headers["Cache-Control"] = "no-store"
    with request.app.state.database.connect() as connection:
        return queries.import_history(connection)


@router.get(
    "/imports/{import_id}",
    summary="Read an import result",
    description="Returns a stored import outcome and the first 20 conflict or rejection reasons.",
    responses={**AUTH_ERRORS, 404: {"model": ErrorResponse, "description": "Import not found"}},
)
def get_import(import_id: UUID, request: Request, response: Response) -> ImportResult:
    require_admin(request)
    response.headers["Cache-Control"] = "no-store"
    with request.app.state.database.connect() as connection:
        result = queries.read_import(connection, import_id)
    if result is None:
        raise HTTPException(404, "Import not found")
    return result


@router.get(
    "/datasets",
    summary="List stored retail datasets",
    description="Returns record counts, last successful import, source date range and version.",
    responses={401: AUTH_ERRORS[401]},
)
def list_datasets(request: Request, response: Response) -> list[DatasetSummary]:
    response.headers["Cache-Control"] = "no-store"
    with request.app.state.database.connect() as connection:
        return queries.inventory(connection)
