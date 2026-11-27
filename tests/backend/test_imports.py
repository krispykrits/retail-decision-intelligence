import secrets
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pwdlib import PasswordHash
from pydantic import SecretStr
from sqlalchemy import event, func, select
from sqlalchemy.orm import Session

from retail_api.accounts.models import Account
from retail_api.config import Settings
from retail_api.customers.queries import publish, source_versions
from retail_api.customers.schemas import ModelEvidence, ModelType
from retail_api.database import create_database_engine
from retail_api.imports import queries, store
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
            assert queries.read_import(db, failed.import_id) == failed
            assert db.scalar(select(func.count()).select_from(households)) == 1
    finally:
        engine.dispose()


def test_import_history_batches_bounded_error_previews(settings: Settings) -> None:
    engine = create_database_engine(settings)
    try:
        for name in ("first.csv", "second.csv"):
            result = store.import_csv(
                engine, Dataset.HOUSEHOLDS, name, BytesIO(HOUSEHOLDS + b"invalid\n" * 25)
            )
            assert result.rejected == 25
        store.import_csv(engine, Dataset.HOUSEHOLDS, "clean.csv", BytesIO(HOUSEHOLDS + HOUSEHOLD))

        statements = []

        @event.listens_for(engine, "before_cursor_execute")
        def count_query(connection, cursor, statement, parameters, context, executemany):
            statements.append(statement)

        with engine.connect() as connection:
            history = queries.import_history(connection)

        assert len(statements) == 2
        assert [run.filename for run in history] == ["clean.csv", "second.csv", "first.csv"]
        assert [run.errors for run in history[:1]] == [[]]
        assert [[error.row_number for error in run.errors] for run in history[1:]] == [
            list(range(2, 22)),
            list(range(2, 22)),
        ]
    finally:
        engine.dispose()


def test_direct_upload_survives_redelivery(
    signed_in: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from types import SimpleNamespace
    from uuid import UUID

    from azure.storage.queue import QueueMessage

    from retail_api.imports import service
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

    monkeypatch.setattr(service, "ImportStorage", FakeStorage)
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
        assert queries.read_import(connection, UUID(import_id)) == result
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
            client,
            "products",
            PRODUCTS
            + PRODUCT
            + b"00000002,HOME,CLEANING,PRIVATE,N\n"
            + b"00000003,FOOD,BAKERY,PRIVATE,N\n",
        ).json()["inserted"]
        == 3
    )
    assert (
        upload(
            client,
            "transactions",
            TRANSACTIONS
            + b"00000001,0040,2020-01-01,00000001,6.00,1,EAST,1,2020\n"
            + b"00000002,0010,2020-06-24,00000003,4.00,2,EAST,26,2020\n"
            + b"00000003,0020,2020-06-27,00000001,6.00,1,EAST,26,2020\n"
            + b"00000004,0010,2020-06-27,00000002,-2.00,-1,EAST,26,2020\n"
            + b"00000005,0010,2020-07-01,00000001,22.00,3,EAST,27,2020\n"
            + b"00000005,0010,2020-07-01,00000001,-2.00,-1,EAST,27,2020\n"
            + b"00000006,0030,2020-07-02,00000002,1.00,1,CENTRAL,27,2020\n"
            + b"00000007,0030,2020-07-07,00000003,-1.00,-1,EAST,28,2020\n",
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
    assert growth["route"] == "/merchandise"
    assert (
        client.get(base, params=growth["route_filters"]).json()["breakdown"]["dimension"]
        == "commodity"
    )
    narrowed = client.get(base, params={**filters, "region": "EAST", "department": "FOOD"}).json()
    assert narrowed["summary"]["current"]["spend"] == "19.0000"
    assert narrowed["summary"]["current"]["households"] == 1
    assert narrowed["trend"]["current"][0]["value"] == "20.0000"
    assert narrowed["breakdown"]["rows"][0]["name"] == "PRODUCE"
    commodity_decline = next(
        signal for signal in narrowed["signals"]["items"] if signal["type"] == "decline"
    )
    assert commodity_decline["evidence"]["name"] == "BAKERY"
    assert commodity_decline["route"] == "/merchandise"
    assert commodity_decline["route_filters"] == {
        **filters,
        "department": "FOOD",
        "commodity": "BAKERY",
        "region": "EAST",
        "metric": "spend",
    }
    assert (
        client.get(
            f"{base}/signals", params={**filters, "region": "EAST", "department": "FOOD"}
        ).json()
        == narrowed["signals"]
    )
    volume = next(signal for signal in narrowed["signals"]["items"] if signal["type"] == "volume")
    assert volume["route"] == "/baskets"
    assert volume["route_filters"] == {
        **filters,
        "department": "FOOD",
        "region": "EAST",
        "metric": "units",
    }

    trend = client.get(f"{base}/trends", params={**filters, "metric": "units", "grain": "week"})
    assert [point["value"] for point in trend.json()["current"]] == ["2"]
    monthly = client.get(f"{base}/trends", params={**filters, "grain": "month"}).json()
    assert monthly["current"][0]["end"] == "2020-07-07"
    by_region = client.get(f"{base}/breakdown", params={**filters, "dimension": "region"}).json()
    assert by_region["rows"][0]["name"] == "EAST"
    assert client.get(f"{base}/summary", params=filters).json() == summary
    assert client.get(f"{base}/filter-options").json() == dashboard["options"]

    for metric in ("spend", "households", "baskets", "units", "avg_basket"):
        params = {**filters, "metric": metric, "grain": "week", "department": "FOOD"}
        overview_trend = client.get(base, params=params).json()["trend"]
        assert client.get(f"{base}/trends", params=params).json() == overview_trend

    partial = client.get(base, params={**filters, "end": "2020-07-08"}).json()
    assert partial["summary"]["current_period"]["partial"]
    assert not partial["summary"]["changes"]
    assert not partial["signals"]["items"]
    assert client.get(base, params={"start": "2020-07-08", "end": "2020-07-01"}).status_code == 422
    assert (
        client.get(base, params={**filters, "region": "WEST"}).json()["summary"]["current"] is None
    )
    assert TestClient(client.app).get(base).status_code == 401


def test_customer_model_api_serves_only_current_validated_scores(signed_in: TestClient) -> None:
    from datetime import UTC, date, datetime
    from decimal import Decimal
    from uuid import uuid4

    from retail_api.customers.definition import HORIZONS, POPULATION, TARGETS
    from retail_api.customers.queries import publish
    from retail_api.customers.schemas import ModelEvidence, ModelType
    from retail_api.imports.schema_v1 import dataset_state

    client = signed_in
    endpoint = "/api/v1/customers"
    no_model = client.get(f"{endpoint}/churn/summary")
    assert no_model.status_code == 200
    assert no_model.headers["Cache-Control"] == "no-store"
    assert no_model.json()["evidence"]["status"] == "not_run"
    assert TestClient(client.app).get(f"{endpoint}/clv/summary").status_code == 401

    with Session(client.app.state.database) as session, session.begin():
        session.scalars(select(Account)).one().is_superuser = True
    assert (
        upload(
            client, "households", HOUSEHOLDS + HOUSEHOLD + HOUSEHOLD.replace(b"0010", b"0020")
        ).status_code
        == 200
    )

    cutoff = date(2020, 8, 15)
    with client.app.state.database.begin() as db:
        for model in ModelType:
            run = ModelEvidence(
                model=model,
                status="available",
                reason="Validated test fixture",
                version=uuid4(),
                as_of=cutoff,
                source_first_date=date(2019, 1, 1),
                source_last_date=cutoff,
                transaction_version=0,
                household_version=1,
                trained_at=datetime.now(UTC),
                horizon_days=HORIZONS[model],
                target=TARGETS[model],
                population=POPULATION,
            )
            active = {
                "run_id": run.version,
                "household_id": "0010",
                "region": "EAST",
                "loyalty_flag": "Y",
                "age_range": None,
                "household_size": None,
                "last_purchase": cutoff,
                "purchase_days_180d": 12,
                "observed_spend_180d": Decimal("100.0000"),
                "eligible": True,
                "forecast": 0.8 if model is ModelType.CHURN else 320.0,
            }
            inactive = {
                **active,
                "household_id": "0020",
                "region": "WEST",
                "last_purchase": date(2019, 10, 1),
                "purchase_days_180d": 0,
                "eligible": False,
                "forecast": None,
            }
            publish(db, run, [active, inactive], "file:///test-artifact.joblib")

    summary = client.get(f"{endpoint}/churn/summary", params={"risk_threshold": 0.75}).json()
    assert summary["high_risk_households"] == summary["inactive_180d"] == 1
    assert summary["regions"]["WEST"]["high_risk_households"] == 0
    assert sum(bucket["count"] for bucket in summary["distribution"]) == 1
    rows = client.get(
        f"{endpoint}/churn/households", params={"region": "EAST", "page_size": 1}
    ).json()
    assert rows["total"] == 1
    assert rows["items"][0]["household_id"] == "0010"
    assert rows["items"][0]["high_risk"]
    assert (
        client.get(f"{endpoint}/churn/households", params={"risk_threshold": 1.1}).status_code
        == 422
    )
    detail = client.get(f"{endpoint}/0010/predictions").json()
    assert detail["future_spend"]["forecast"] == 320.0
    assert detail["future_spend"]["recency_days"] == 0
    assert client.get(f"{endpoint}/9999/predictions").status_code == 404

    with client.app.state.database.begin() as db:
        db.execute(
            dataset_state.update()
            .where(dataset_state.c.dataset == Dataset.HOUSEHOLDS)
            .values(version=2)
        )
    stale = client.get(f"{endpoint}/models/churn/evaluation").json()
    assert stale["status"] == "stale"
    stale_summary = client.get(f"{endpoint}/churn/summary").json()
    assert stale_summary["scored_households"] == 0
    assert stale_summary["high_risk_households"] is None
    assert not stale_summary["distribution"]
    assert client.get(f"{endpoint}/0010/predictions").json()["churn_risk"]["forecast"] is None


def test_clv_trend_uses_complete_periods_and_the_published_cohort(signed_in: TestClient) -> None:
    client = signed_in
    engine = client.app.state.database
    with Session(engine) as db, db.begin():
        db.scalars(select(Account)).one().is_superuser = True

    assert (
        upload(
            client, "households", HOUSEHOLDS + HOUSEHOLD + HOUSEHOLD.replace(b"0010,Y", b"0011,N")
        ).json()["inserted"]
        == 2
    )
    assert upload(client, "products", PRODUCTS + PRODUCT).json()["inserted"] == 1

    rows = (
        b"00000001,0010,2020-02-17,00000001,1000,1,CENTRAL,8,2020\n"
        b"00000002,0010,2020-02-18,00000001,30,1,WEST,8,2020\n"
        b"00000003,0010,2020-05-17,00000001,-5,-1,CENTRAL,20,2020\n"
        b"00000004,0010,2020-05-18,00000001,70,1,CENTRAL,21,2020\n"
        b"00000005,0010,2020-08-15,00000001,20,1,CENTRAL,33,2020\n"
        b"00000006,0010,2020-08-16,00000001,500,1,CENTRAL,33,2020\n"
        b"00000007,0011,2020-08-15,00000001,60,1,CENTRAL,33,2020\n"
    )
    assert upload(client, "transactions", TRANSACTIONS + rows).json()["inserted"] == 7
    engagement = "/api/v1/customers/churn/engagement"
    assert TestClient(client.app).get(engagement).status_code == 401
    observed = client.get(engagement).json()
    assert observed["evidence"]["status"] == "not_run"
    assert observed["as_of"] == "2020-08-16"
    assert observed["trend"][-1]["active"] == len(observed["households"]) == 2
    assert all(row["churn_risk"] is None for row in observed["households"])
    filtered = client.get(engagement, params={"loyalty_flag": "N", "region": "CENTRAL"}).json()
    assert [row["household_id"] for row in filtered["households"]] == ["0011"]
    assert filtered["trend"][-1]["active"] == 1

    endpoint = "/api/v1/customers/clv/summary"
    assert client.get(endpoint).json()["historical_spend"] == []

    cutoff = date(2020, 8, 15)
    version = uuid4()
    with engine.begin() as db:
        transaction_version, household_version = source_versions(db)
        evidence = ModelEvidence(
            model=ModelType.CLV,
            status="unavailable",
            reason="The model did not pass validation.",
            version=version,
            as_of=cutoff,
            source_first_date=date(2020, 2, 17),
            source_last_date=date(2020, 8, 16),
            trained_at=datetime.now(UTC),
            transaction_version=transaction_version,
            household_version=household_version,
            horizon_days=90,
            target="90-day net household spend",
            population="Eligible households",
        )
        publish(
            db,
            evidence,
            [
                {
                    "run_id": version,
                    "household_id": household,
                    "region": region,
                    "loyalty_flag": loyalty,
                    "age_range": None,
                    "household_size": None,
                    "last_purchase": cutoff,
                    "purchase_days_180d": days,
                    "observed_spend_180d": Decimal(spend),
                    "eligible": True,
                    "forecast": None,
                }
                for household, region, loyalty, days, spend in (
                    ("0010", "CENTRAL", "Y", 3, 115),
                    ("0011", "EAST", "N", 1, 60),
                )
            ],
            None,
        )

    result = client.get(endpoint, params={"region": "CENTRAL", "loyalty_flag": "Y"})
    assert result.status_code == 200
    cohort = result.json()
    assert cohort["observed_households"] == 1
    assert cohort["distribution"] == []
    assert [
        (period["start"], period["end"], Decimal(period["net_spend"]))
        for period in cohort["historical_spend"]
    ] == [
        ("2020-02-18", "2020-05-17", Decimal(25)),
        ("2020-05-18", "2020-08-15", Decimal(90)),
    ]
    assert [
        (segment["segment"], segment["households"], Decimal(segment["net_spend"]))
        for segment in cohort["observed_spend_segments"]
    ] == [("higher_spend", 1, Decimal(90))]
    ranked = client.get("/api/v1/customers/clv/households", params={"region": "CENTRAL"}).json()
    assert Decimal(ranked["items"][0]["observed_spend_90d"]) == 90
    detail = client.get("/api/v1/customers/0010/predictions").json()
    assert Decimal(detail["future_spend"]["observed_spend_90d"]) == 90
    unfiltered = client.get(endpoint).json()
    assert unfiltered["loyalty_filter"] is None
    assert {
        row["loyalty_flag"]: (row["households"], Decimal(row["net_spend"]))
        for row in unfiltered["observed_spend_by_loyalty"]
    } == {"Y": (1, Decimal(90)), "N": (1, Decimal(60))}
    assert cohort["loyalty_filter"] == "Y"
    non_member = client.get(endpoint, params={"loyalty_flag": "N"}).json()
    assert non_member["loyalty_filter"] == "N"
    assert {row["segment"] for row in non_member["observed_spend_segments"]} == {"other"}
    high = client.get(endpoint, params={"segment": "higher_spend"}).json()
    assert high["observed_households"] == 1
    assert high["evidence"]["as_of"] == cutoff.isoformat()
    assert high["historical_spend"] == cohort["historical_spend"]
    filtered = client.get(
        "/api/v1/customers/clv/households", params={"segment": "higher_spend"}
    ).json()
    assert [row["household_id"] for row in filtered["items"]] == ["0010"]
    east = client.get(endpoint, params={"region": "EAST"}).json()
    assert [Decimal(period["net_spend"]) for period in east["historical_spend"]] == [0, 60]
    assert client.get(endpoint, params={"region": "WEST"}).json()["historical_spend"] == []

    later = b"00000008,0010,2020-08-17,00000001,75,1,CENTRAL,34,2020\n"
    assert upload(client, "transactions", TRANSACTIONS + later).json()["inserted"] == 1
    stale = client.get(endpoint).json()
    assert stale["evidence"]["status"] == "stale"
    assert stale["historical_spend"] == stale["observed_spend_segments"] == []


def test_forecast_accuracy_reads_coverage_and_only_current_scoped_checks(
    signed_in: TestClient,
) -> None:
    from retail_api.forecasts.schema_v1 import accuracy_checks
    from retail_api.forecasts.schemas import AccuracyEvidence

    client = signed_in
    endpoint = "/api/v1/forecasts/accuracy"
    assert TestClient(client.app).get(endpoint).status_code == 401
    assert client.get(endpoint).json()["coverage"]["complete_weeks"] == 0

    with Session(client.app.state.database) as db, db.begin():
        db.scalars(select(Account)).one().is_superuser = True
    assert upload(client, "households", HOUSEHOLDS + HOUSEHOLD).status_code == 200
    assert upload(client, "products", PRODUCTS + PRODUCT).status_code == 200
    lines = (
        b"00000001,0010,17-AUG-18,00000001,1,1,CENTRAL,32,2018\n"
        b"00000002,0010,20-AUG-18,00000001,2,2,CENTRAL,34,2018\n"
        b"00000003,0010,26-AUG-18,00000001,-2,-2,CENTRAL,34,2018\n"
        b"00000004,0010,01-SEP-18,00000001,1,1,CENTRAL,35,2018\n"
        b"00000005,0010,09-SEP-18,00000001,1,1,EAST,36,2018\n"
    )
    assert upload(client, "transactions", TRANSACTIONS + lines).json()["inserted"] == 5
    response = client.get(endpoint, params={"region": "CENTRAL"})
    assert response.status_code == 200
    assert response.json()["coverage"] == {
        "first_purchase": "2018-08-17",
        "last_purchase": "2018-09-01",
        "first_complete_week": "2018-08-20",
        "last_complete_week_end": "2018-08-26",
        "complete_weeks": 1,
        "weeks_with_purchases": 1,
    }

    result = AccuracyEvidence(status="insufficient_history", reason="Too few weeks.")
    check_id = uuid4()
    with client.app.state.database.begin() as db:
        db.execute(
            accuracy_checks.insert().values(
                id=check_id,
                commodity="PRODUCE",
                region="CENTRAL",
                transaction_version=1,
                product_version=1,
                model_version="ridge-lag-v1",
                checked_at=datetime(2018, 9, 10),
                status=result.status,
                evidence=result.model_dump_json(),
            )
        )
    response = client.get(endpoint, params={"region": "CENTRAL", "check_id": str(check_id)})
    assert response.json()["selected"]["evidence"]["status"] == "insufficient_history"
    assert response.json()["selected"]["evidence"]["horizons"] == []
    assert client.get(endpoint, params={"check_id": str(check_id)}).json()["selected"] is None

    update = b"00000006,0010,10-SEP-18,00000001,1,1,CENTRAL,37,2018\n"
    assert upload(client, "transactions", TRANSACTIONS + update).json()["inserted"] == 1
    response = client.get(endpoint, params={"region": "CENTRAL", "check_id": str(check_id)})
    assert response.json()["checks"] == []
    assert response.json()["selected"] is None
