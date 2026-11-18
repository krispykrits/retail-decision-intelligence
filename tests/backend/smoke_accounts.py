"""CI-only session/role check against the disposable SQL Server and running container."""

import json
import secrets
from datetime import UTC, date, datetime
from decimal import Decimal
from http.cookies import SimpleCookie
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

from pwdlib import PasswordHash
from sqlalchemy import delete
from sqlalchemy.orm import Session

from retail_api.accounts.models import Account, AccountSession
from retail_api.config import Settings
from retail_api.customers.definition import HORIZONS, POPULATION, TARGETS
from retail_api.customers.queries import publish, source_versions
from retail_api.customers.schemas import ModelEvidence, ModelType
from retail_api.database import create_database_engine


def main() -> None:
    # This script runs inside the isolated CI container, never against Azure.
    base_url = "http://127.0.0.1:8000/api/v1"
    cookies: dict[str, str] = {}

    def request(method: str, path: str, expected: int, body: object = None, *, multipart: str = ""):
        content_type = (
            f"multipart/form-data; boundary={multipart}" if multipart else "application/json"
        )
        headers = {"Content-Type": content_type}
        if method != "GET":
            headers["X-CSRF-Token"] = str(request("GET", "/auth/csrf", 200)["token"])
        headers["Cookie"] = "; ".join(f"{key}={value}" for key, value in cookies.items())
        data = body if multipart or body is None else json.dumps(body).encode()
        try:
            response = urlopen(
                Request(base_url + path, data=data, headers=headers, method=method), timeout=10
            )
        except HTTPError as error:
            response = error
        with response:
            assert response.status == expected, (
                f"Account smoke failed: {method} {path} -> {response.status}"
            )
            for header in response.headers.get_all("Set-Cookie", []):
                parsed = SimpleCookie(header)
                for name, morsel in parsed.items():
                    cookies[name] = morsel.value
            content = response.read()
            return json.loads(content) if content else {}

    def upload(dataset: str, csv: str, expected: int = 200, name: str = "fixture.csv"):
        boundary = uuid4().hex
        body = (
            f'--{boundary}\r\nContent-Disposition: form-data; name="dataset"\r\n\r\n'
            f"{dataset}\r\n--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{name}"\r\n'
            f"Content-Type: text/csv\r\n\r\n{csv}\r\n--{boundary}--\r\n"
        )
        return request("POST", "/imports", expected, body.encode(), multipart=boundary)

    households = (
        "HSHD_NUM,L,AGE_RANGE,MARITAL,INCOME_RANGE,HOMEOWNER,HSHD_COMPOSITION,HH_SIZE,CHILDREN\n"
        "0010,Y,null,null,null,null,null,null,null\n"
    )
    products = (
        "PRODUCT_NUM,DEPARTMENT,COMMODITY,BRAND_TY,NATURAL_ORGANIC_FLAG\n"
        "00000001,FOOD,PRODUCE,PRIVATE,N\n"
    )
    transactions = "BASKET_NUM,HSHD_NUM,PURCHASE_,PRODUCT_NUM,SPEND,UNITS,STORE_R,WEEK_NUM,YEAR\n"
    line = "00000001,0010,17-AUG-18,00000001,-.59,-1,CENTRAL,32,2018\n"
    engine = create_database_engine(Settings())
    account_id = uuid4()
    email = f"ci-{account_id.hex}@example.com"
    password = secrets.token_urlsafe(32)
    try:
        # Verification delivery is covered separately; no real mailbox is used in CI.
        with Session(engine) as db, db.begin():
            db.add(
                Account(
                    id=account_id,
                    email=email,
                    display_name="CI account",
                    hashed_password=PasswordHash.recommended().hash(password),
                    is_verified=True,
                )
            )
        request("POST", "/auth/login", 204, {"email": email, "password": password})
        assert request("GET", "/me", 200)["roles"] == ["Analyst"]
        upload("households", households, expected=403)
        with Session(engine) as db, db.begin():
            account = db.get(Account, account_id)
            assert account is not None
            account.is_superuser = True
        assert request("GET", "/me", 200)["roles"] == ["Administrator"]
        # Exercise multipart, nullable demographics, signed sales and repeat rows through ODBC.
        assert upload("households", households)["inserted"] == 1
        assert upload("products", products)["inserted"] == 1
        assert upload("transactions", transactions + line * 2)["inserted"] == 2
        duplicate = upload("transactions", transactions + line * 2, name="retry.csv")
        assert duplicate["inserted"] == 0 and duplicate["duplicates_skipped"] == 2
        invalid = upload("transactions", transactions + line.replace(",0010,", ",9999,"))
        assert invalid["status"] == "completed_with_errors" and invalid["rejected"] == 1
        stored = request("GET", f"/imports/{invalid['import_id']}", 200)
        assert stored == invalid, (stored, invalid)
        history = request("GET", "/imports", 200)
        assert len(history) == 5 and history[0] == invalid, history
        assert history[1] == duplicate, history
        assert [item["records"] for item in request("GET", "/datasets", 200)] == [1, 1, 2]
        prior = "00000002,0010,2018-02-16,00000001,2.00,1,CENTRAL,7,2018\n"
        assert upload("transactions", transactions + prior)["inserted"] == 1
        query = "?start=2018-08-17&end=2018-08-17&region=CENTRAL&department=FOOD"
        overview = request("GET", f"/dashboard{query}", 200)
        assert overview["summary"]["current"]["lines"] == 2
        assert overview["summary"]["inactivity"] == {
            "days": 180,
            "eligible": 1,
            "inactive": 1,
            "as_of": "2018-08-17",
        }
        assert request("GET", f"/dashboard/trends{query}", 200) == overview["trend"]
        endpoint = "/customers"
        assert request("GET", f"{endpoint}/churn/summary", 200)["evidence"]["status"] == "not_run"
        cutoff = date(2018, 8, 17)
        version = uuid4()
        model = ModelType.CHURN
        with engine.begin() as db:
            transaction_version, household_version = source_versions(db)
            evidence = ModelEvidence(
                model=model,
                status="available",
                reason="CI API fixture",
                version=version,
                as_of=cutoff,
                trained_at=datetime.now(UTC),
                source_first_date=date(2018, 2, 16),
                source_last_date=cutoff,
                transaction_version=transaction_version,
                household_version=household_version,
                horizon_days=HORIZONS[model],
                target=TARGETS[model],
                population=POPULATION,
            )
            publish(
                db,
                evidence,
                [
                    {
                        "run_id": version,
                        "household_id": "0010",
                        "region": "CENTRAL",
                        "loyalty_flag": "Y",
                        "age_range": None,
                        "household_size": None,
                        "last_purchase": cutoff,
                        "purchase_days_180d": 8,
                        "eligible": True,
                        "observed_spend_180d": Decimal("20.05"),
                        "forecast": 0.8,
                    }
                ],
                "file:///ci-fixture.joblib",
            )
        summary = request("GET", f"{endpoint}/churn/summary?region=CENTRAL", 200)
        assert summary["high_risk_households"] == 1
        assert sum(bucket["count"] for bucket in summary["distribution"]) == 1
        assert (
            request("GET", f"{endpoint}/churn/households?page_size=1", 200)["items"][0][
                "household_id"
            ]
            == "0010"
        )
        print("SQL Server smoke passed for sessions, CSV imports, dashboard, and customer models.")

    finally:
        with Session(engine) as db, db.begin():
            db.execute(delete(AccountSession).where(AccountSession.account_id == account_id))
            db.execute(delete(Account).where(Account.id == account_id))
        engine.dispose()


if __name__ == "__main__":
    main()
