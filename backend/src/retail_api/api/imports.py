from collections.abc import AsyncGenerator
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, Response
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import FormData, UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser

from retail_api.accounts.models import AccountUser
from retail_api.accounts.schemas import ErrorResponse
from retail_api.imports import store
from retail_api.imports.schemas import Dataset, DatasetSummary, ImportResult

router = APIRouter(tags=["Data Operations"])
MULTIPART_OVERHEAD = 16 * 1024
AUTH_ERRORS: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorResponse, "description": "Sign in required"},
    403: {"model": ErrorResponse, "description": "Administrator and valid CSRF token required"},
}


async def limit_body(request: Request, limit: int) -> AsyncGenerator[bytes, None]:
    received = 0
    async for chunk in request.stream():
        received += len(chunk)
        if received > limit:
            raise HTTPException(413, "The CSV is larger than the configured upload limit.")
        yield chunk


async def upload_form(request: Request, limit: int) -> FormData:
    if request.headers.get("content-type", "").partition(";")[0].lower() != "multipart/form-data":
        raise HTTPException(415, "Send the dataset and CSV as multipart form data.")
    if request.headers.get("content-length", "").isdigit():
        if int(request.headers["content-length"]) > limit + MULTIPART_OVERHEAD:
            raise HTTPException(413, "The CSV is larger than the configured upload limit.")
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
    limit: int = request.app.state.settings.import_max_bytes
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
        filename = (uploaded.filename or "").replace("\\", "/").rsplit("/", 1)[-1]
        if not filename.lower().endswith(".csv"):
            raise HTTPException(422, "Choose a CSV file.")
        if uploaded.size is None or uploaded.size > limit:
            raise HTTPException(413, "The CSV is larger than the configured upload limit.")
        engine = request.app.state.database
        response.headers["Cache-Control"] = "no-store"
        return await run_in_threadpool(
            store.import_csv, engine, dataset, filename[:120], uploaded.file
        )
    except store.ImportUnavailable as error:
        raise HTTPException(503, str(error)) from error
    finally:
        await form.close()


def require_admin(request: Request) -> None:
    account: AccountUser = request.state.account
    if not account.is_superuser:
        raise HTTPException(403, "Administrator access required")


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
        return store.import_history(connection)


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
        result = store.read_import(connection, import_id)
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
        return store.inventory(connection)
