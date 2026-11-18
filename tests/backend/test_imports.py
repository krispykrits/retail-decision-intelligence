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
    assert client.get("/api/v1/datasets").status_code == 200
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
