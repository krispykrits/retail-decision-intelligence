import secrets
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pwdlib import PasswordHash
from pydantic import SecretStr
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from retail_api.accounts.models import Account
from retail_api.config import Settings
from retail_api.database import create_database_engine
from retail_api.imports import store
from retail_api.imports.schema_v1 import households, transactions
from retail_api.imports.schemas import Dataset, ImportStatus
from retail_api.main import create_app
from retail_api.migrate import upgrade_database

HOUSEHOLDS = (
    b"HSHD_NUM,L,AGE_RANGE,MARITAL,INCOME_RANGE,HOMEOWNER,HSHD_COMPOSITION,HH_SIZE,CHILDREN\n"
)
HOUSEHOLD = b"0010,Y,null,null,null,null,null,null,null\n"
PRODUCTS = b"PRODUCT_NUM,DEPARTMENT,COMMODITY,BRAND_TY,NATURAL_ORGANIC_FLAG\n"
PRODUCT = b"00000001,FOOD,PRODUCE,PRIVATE,N\n"
TRANSACTIONS = b"BASKET_NUM,HSHD_NUM,PURCHASE_,PRODUCT_NUM,SPEND,UNITS,STORE_R,WEEK_NUM,YEAR\n"
LINE = b"00000001,0010,17-AUG-18,00000001,-.59,-1,CENTRAL,32,2018\n"


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    configuration = Settings(
        database_url=SecretStr(f"sqlite:///{tmp_path / 'imports.db'}"),
        auth_secret=SecretStr(secrets.token_urlsafe(32)),
        _env_file=None,
    )
    upgrade_database(configuration)
    return configuration


@pytest.fixture
def signed_in(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as client:
        password = secrets.token_urlsafe(32)
        with Session(client.app.state.database) as db, db.begin():
            db.add(
                Account(
                    email="analyst@example.com",
                    display_name="Analyst",
                    is_verified=True,
                    hashed_password=PasswordHash.recommended().hash(password),
                )
            )
        token = client.get("/api/v1/auth/csrf").json()["token"]
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "analyst@example.com", "password": password},
            headers={"X-CSRF-Token": token},
        )
        assert response.status_code == 204
        yield client


def upload(client: TestClient, dataset: str, content: bytes, filename: str = "data.csv"):
    token = client.get("/api/v1/auth/csrf").json()["token"]
    return client.post(
        "/api/v1/imports",
        files={"file": (filename, content, "text/csv")},
        data={"dataset": dataset},
        headers={"X-CSRF-Token": token},
    )


def test_import_api_preserves_records_and_reports_rejections(signed_in: TestClient) -> None:
    client = signed_in
    response = client.get("/api/v1/datasets")
    assert response.status_code == 200
    assert [row["dataset"] for row in response.json()] == list(Dataset)
    assert all(
        row["records"] == row["version"] == 0 and row["last_success"] is None
        for row in response.json()
    )
    assert upload(client, "households", HOUSEHOLDS + HOUSEHOLD).status_code == 403
    assert client.get("/api/v1/imports").status_code == 403
    with Session(client.app.state.database) as db, db.begin():
        db.scalars(select(Account)).one().is_superuser = True

    assert upload(client, "households", HOUSEHOLDS + HOUSEHOLD).json()["inserted"] == 1
    assert upload(client, "products", PRODUCTS + PRODUCT).json()["inserted"] == 1
    invalid_parent = LINE.replace(b",0010,", b",9999,")
    invalid_spend = LINE.replace(b"-.59", b"invalid")
    invalid_date = LINE.replace(b"17-AUG-18", b"31-FEB-18")
    uploaded = upload(
        client,
        "transactions",
        TRANSACTIONS + LINE * 2 + invalid_parent + invalid_spend + invalid_date,
    )
    assert uploaded.status_code == 200
    result = uploaded.json()
    assert result["status"] == "completed_with_errors"
    assert (result["processed"], result["inserted"], result["rejected"]) == (5, 2, 3)
    assert [error["row_number"] for error in result["errors"]] == [4, 5, 6]
    assert client.get(f"/api/v1/imports/{result['import_id']}").json() == result
    assert client.get("/api/v1/imports").json()[0] == result

    retry = upload(client, "transactions", TRANSACTIONS + LINE * 2, "retry.csv").json()
    assert (retry["inserted"], retry["duplicates_skipped"]) == (0, 2)
    retry = upload(client, "transactions", TRANSACTIONS + LINE * 2, "renamed.csv").json()
    assert (retry["inserted"], retry["duplicates_skipped"]) == (0, 2)
    extra_line = upload(client, "transactions", TRANSACTIONS + LINE * 3).json()
    assert (extra_line["inserted"], extra_line["duplicates_skipped"]) == (1, 2)

    conflict = HOUSEHOLD.replace(b",Y,", b",N,")
    new_household = HOUSEHOLD.replace(b"0010", b"0011")
    result = upload(client, "households", HOUSEHOLDS + conflict + new_household).json()
    assert (result["inserted"], result["conflicts"]) == (1, 1)
    assert result["errors"][0]["row_number"] == 2
    with client.app.state.database.connect() as db:
        assert (
            db.scalar(select(households.c.loyalty_flag).where(households.c.household_id == "0010"))
            == "Y"
        )
        assert db.execute(
            select(transactions.c.occurrence, transactions.c.source_row).order_by(
                transactions.c.occurrence
            )
        ).all() == [(1, 2), (2, 3), (3, 4)]
    inventory = {row["dataset"]: row for row in client.get("/api/v1/datasets").json()}
    assert [inventory[dataset]["records"] for dataset in Dataset] == [2, 1, 3]
    assert inventory["transactions"]["source_window"] == {
        "start": "2018-08-17",
        "end": "2018-08-17",
    }
    assert inventory["transactions"]["version"] == 2


def test_failed_import_rolls_back_and_concurrent_retries_share_no_rows(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(store, "BATCH_SIZE", 1)
    engine = create_database_engine(settings)
    content = HOUSEHOLDS + HOUSEHOLD
    failed = store.import_csv(engine, Dataset.HOUSEHOLDS, "bad.csv", BytesIO(content + b'"\n'))
    assert failed.status is ImportStatus.FAILED
    with engine.connect() as db:
        assert db.scalar(select(func.count()).select_from(households)) == 0
    engine.dispose()
    engine = create_database_engine(settings)

    def import_file(index: int) -> tuple[int, int]:
        result = store.import_csv(engine, Dataset.HOUSEHOLDS, f"{index}.csv", BytesIO(content))
        assert result.status is ImportStatus.COMPLETED
        return result.inserted, result.duplicates_skipped

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            assert sorted(executor.map(import_file, range(2))) == [(0, 1), (1, 0)]
        with engine.connect() as db:
            assert store.read_import(db, failed.import_id) == failed
            assert db.scalar(select(func.count()).select_from(households)) == 1
    finally:
        engine.dispose()


def test_direct_upload_survives_redelivery(
    signed_in: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from types import SimpleNamespace
    from uuid import UUID

    from azure.storage.queue import QueueMessage

    from retail_api.api import imports as imports_api
    from retail_api.imports.worker import process_message

    client = signed_in
    settings = client.app.state.settings
    settings.import_storage_account = "rditestimports"
    contents = HOUSEHOLDS + HOUSEHOLD
    queue: list[str] = []
    deleted: list[str] = []

    class FileBlob:
        def get_blob_properties(self):
            return SimpleNamespace(size=len(contents), etag="stable")

        def download_blob(self, **kwargs):
            return SimpleNamespace(readinto=lambda target: target.write(contents))

    class FakeStorage:
        def __init__(self, settings):
            self.queue = SimpleNamespace(
                send_message=lambda item, **kw: queue.append(item),
                delete_message=lambda message: deleted.append(message.content),
            )

        def blob(self, import_id):
            return FileBlob()

        def upload_url(self, import_id):
            return f"https://example.test/{import_id}.csv"

        def close(self):
            pass

    monkeypatch.setattr(imports_api, "ImportStorage", FakeStorage)
    payload = {"dataset": "households", "filename": "households.csv", "size_bytes": len(contents)}

    def post(path, **kwargs):
        token = client.get("/api/v1/auth/csrf").json()["token"]
        return client.post(path, headers={"X-CSRF-Token": token}, **kwargs)

    assert post("/api/v1/import-jobs", json=payload).status_code == 403
    engine = client.app.state.database
    with Session(engine) as db, db.begin():
        db.scalars(select(Account)).one().is_superuser = True

    response = post("/api/v1/import-jobs", json=payload)
    assert response.status_code == 201
    import_id = response.json()["import_id"]
    path = f"/api/v1/import-jobs/{import_id}"
    assert client.get(path).json()["status"] == "awaiting_upload"
    assert post(f"{path}/submit").json()["status"] == "queued"
    assert post(f"{path}/submit").json()["status"] == "queued"
    assert queue == [import_id]

    message = QueueMessage(content=import_id)
    process_message(engine, FakeStorage(settings), settings, message)
    process_message(engine, FakeStorage(settings), settings, message)
    with engine.connect() as connection:
        with BytesIO(contents) as source:
            result = store.import_csv(
                engine, Dataset.HOUSEHOLDS, "households.csv", source, import_id=UUID(import_id)
            )
        assert store.read_import(connection, UUID(import_id)) == result
        assert connection.scalar(select(func.count()).select_from(households)) == 1
    state = client.get(path).json()
    assert state["status"] == "finished" and state["result"]["inserted"] == 1
    assert deleted == [import_id, import_id]


def test_dashboard_reconciles_imported_data_and_filters(signed_in: TestClient) -> None:
    client = signed_in
    with Session(client.app.state.database) as db, db.begin():
        db.scalars(select(Account)).one().is_superuser = True
    assert (
        upload(
            client,
            "households",
            HOUSEHOLDS
            + b"".join(
                HOUSEHOLD.replace(b"0010", household)
                for household in (b"0010", b"0020", b"0030", b"0040")
            ),
        ).json()["inserted"]
        == 4
    )
    assert (
        upload(
            client, "products", PRODUCTS + PRODUCT + b"00000002,HOME,CLEANING,PRIVATE,N\n"
        ).json()["inserted"]
        == 2
    )
    assert (
        upload(
            client,
            "transactions",
            TRANSACTIONS
            + b"00000001,0040,2020-01-01,00000001,6.00,1,EAST,1,2020\n"
            + b"00000002,0010,2020-06-24,00000001,4.00,2,EAST,26,2020\n"
            + b"00000003,0020,2020-06-27,00000001,6.00,1,EAST,26,2020\n"
            + b"00000004,0010,2020-06-27,00000002,-2.00,-1,EAST,26,2020\n"
            + b"00000005,0010,2020-07-01,00000001,22.00,3,EAST,27,2020\n"
            + b"00000005,0010,2020-07-01,00000001,-2.00,-1,EAST,27,2020\n"
            + b"00000006,0030,2020-07-02,00000002,1.00,1,CENTRAL,27,2020\n"
            + b"00000007,0030,2020-07-07,00000001,-1.00,-1,EAST,28,2020\n",
        ).json()["inserted"]
        == 8
    )
    with Session(client.app.state.database) as db, db.begin():
        db.scalars(select(Account)).one().is_superuser = False

    base = "/api/v1/dashboard"
    filters = {"start": "2020-07-01", "end": "2020-07-07"}
    response = client.get(base, params=filters)
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
    dashboard = response.json()
    summary = dashboard["summary"]
    assert summary["current"] == dict(
        lines=4,
        spend="20.0000",
        households=2,
        baskets=3,
        units=2,
        avg_basket="6.666666666666666666666666667",
    )
    assert summary["prior"]["spend"] == "8.0000"
    assert summary["changes"]["spend"]["percent"] == "150.0"
    assert summary["cohorts"] == dict(
        previous_active=2,
        active_in_both=1,
        active_only_in_current=1,
        active_only_in_previous=1,
    )
    assert summary["inactivity"] == dict(days=180, eligible=4, inactive=1, as_of="2020-07-07")
    assert summary["source_version"] == 1
    assert [point["index"] for point in dashboard["trend"]["current"]] == [0, 1, 6]
    assert dashboard["options"]["regions"] == ["CENTRAL", "EAST"]
    assert dashboard["breakdown"]["rows"][1]["change"]["percent"] is None

    signals = client.get(f"{base}/signals", params=filters).json()
    growth = next(signal for signal in signals["items"] if signal["type"] == "growth")
    assert growth["evidence"]["current_lines"] > 0
    assert growth["route"] == "/command-center"
    assert (
        client.get(base, params=growth["route_filters"]).json()["breakdown"]["dimension"]
        == "commodity"
    )
    narrowed = client.get(base, params={**filters, "region": "EAST", "department": "FOOD"}).json()
    assert narrowed["summary"]["current"]["spend"] == "19.0000"
    assert narrowed["summary"]["current"]["households"] == 1
    assert narrowed["trend"]["current"][0]["value"] == "20.0000"
    assert narrowed["breakdown"]["rows"][0]["name"] == "PRODUCE"

    trend = client.get(f"{base}/trends", params={**filters, "metric": "units", "grain": "week"})
    assert [point["value"] for point in trend.json()["current"]] == ["2"]
    monthly = client.get(f"{base}/trends", params={**filters, "grain": "month"}).json()
    assert monthly["current"][0]["end"] == "2020-07-07"
    by_region = client.get(f"{base}/breakdown", params={**filters, "dimension": "region"}).json()
    assert by_region["rows"][0]["name"] == "EAST"
    assert client.get(f"{base}/summary", params=filters).json() == summary
    assert client.get(f"{base}/filter-options").json() == dashboard["options"]

    partial = client.get(base, params={**filters, "end": "2020-07-08"}).json()
    assert partial["summary"]["current_period"]["partial"]
    assert not partial["summary"]["changes"]
    assert not partial["signals"]["items"]
    assert client.get(base, params={"start": "2020-07-08", "end": "2020-07-01"}).status_code == 422
    assert (
        client.get(base, params={**filters, "region": "WEST"}).json()["summary"]["current"] is None
    )
    assert TestClient(client.app).get(base).status_code == 401
