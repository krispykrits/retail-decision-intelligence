"""Manually train, evaluate and publish customer models from the imported SQL datasets."""

import argparse
from datetime import UTC, date, datetime
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4

import joblib
import sklearn
from azure.identity import DefaultAzureCredential
from azure.storage.blob import ContainerClient
from sqlalchemy.engine import Engine

from ml.customer_models.features import FEATURES, History, Observation, load_history
from ml.customer_models.training import scores, train_model
from retail_api.config import Settings
from retail_api.customers.definition import HORIZONS, POPULATION, TARGETS
from retail_api.customers.queries import publish, source_versions
from retail_api.customers.schemas import ModelEvidence, ModelType
from retail_api.customers.training_source import Profile
from retail_api.database import create_database_engine

CAVEATS = [
    "Activity and outcomes cover purchases recorded in the imported data.",
    "Validation measures predictive accuracy at historical cutoffs.",
    "The confidence interval resamples households and describes improvement over the baseline.",
    "Region uses the most positive units on the last purchase day, with alphabetical ties.",
]


def materialize(
    history: History, cutoff: date, model: ModelType, versions: tuple[int, int]
) -> tuple[ModelEvidence, list[dict[str, Any]], Any]:
    evaluation, estimator = train_model(history, model, cutoff)
    version = uuid4()
    observed: list[tuple[str, Observation]] = [
        (household_id, row)
        for household_id, ledger in history.ledgers.items()
        if (row := ledger.observe(cutoff)) is not None
    ]
    eligible = [(household_id, row) for household_id, row in observed if row.eligible]
    predictions = (
        dict(
            zip(
                (household_id for household_id, _ in eligible),
                scores(estimator, [row for _, row in eligible], model).tolist(),
                strict=True,
            )
        )
        if estimator is not None
        else {}
    )
    evidence = ModelEvidence(
        model=model,
        status="available" if predictions else "unavailable",
        reason=evaluation.reason
        if predictions or estimator is None
        else "There are no eligible households at this cutoff.",
        version=version,
        as_of=cutoff,
        source_first_date=history.first_date,
        source_last_date=history.last_date,
        transaction_version=versions[0],
        household_version=versions[1],
        trained_at=datetime.now(UTC),
        horizon_days=HORIZONS[model],
        target=TARGETS[model],
        population=POPULATION,
        caveats=CAVEATS,
        features=FEATURES,
        evaluation=evaluation,
    )
    rows = []
    for household_id, row in observed:
        profile = history.profiles.get(household_id, Profile(None, None, None))
        rows.append(
            {
                "run_id": version,
                "household_id": household_id,
                "region": row.region,
                "loyalty_flag": profile.loyalty_flag,
                "age_range": profile.age_range,
                "household_size": profile.household_size,
                "last_purchase": row.last_purchase,
                "purchase_days_180d": row.purchase_days,
                "observed_spend_180d": row.spend,
                "eligible": row.eligible,
                "forecast": predictions.get(household_id),
            }
        )
    return evidence, rows, estimator


def validate_container_url(value: str) -> str:
    url = urlsplit(value)
    if (
        url.scheme != "https"
        or not url.hostname
        or not url.hostname.endswith(".blob.core.windows.net")
        or url.netloc != url.hostname
        or url.query
        or url.fragment
        or not url.path.strip("/")
        or "/" in url.path.strip("/")
    ):
        raise argparse.ArgumentTypeError(
            "Use an Azure Blob container HTTPS URL without a SAS token."
        )
    return value


def save_artifact(
    evidence: ModelEvidence,
    estimator: Any,
    directory: Path | None,
    container_url: str | None,
) -> str:
    name = f"{evidence.model}/{evidence.version}.joblib"
    artifact = {
        "estimator": estimator,
        "evidence": evidence.model_dump(mode="json"),
        "feature_order": list(FEATURES),
        "scikit_learn_version": sklearn.__version__,
    }
    if container_url:
        with BytesIO() as stream, DefaultAzureCredential() as credential:
            joblib.dump(artifact, stream, compress=3)
            stream.seek(0)
            with ContainerClient.from_container_url(
                container_url, credential=credential
            ) as container:
                blob = container.get_blob_client(name)
                blob.upload_blob(stream, overwrite=False)
                return str(blob.url)
    if directory is None:
        raise ValueError(
            "Choose --artifact-dir or --artifact-container-url to publish a validated model."
        )
    target = directory.resolve() / name
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("xb") as output:
        joblib.dump(artifact, output, compress=3)
    return target.as_uri()


def run(engine: Engine, arguments: argparse.Namespace) -> list[ModelEvidence]:
    with engine.connect() as connection:
        versions = source_versions(connection)
        history = load_history(connection, arguments.as_of)
        if versions != source_versions(connection):
            raise ValueError("Source revisions changed during the read. Retry the run.")
    as_of = arguments.as_of or history.last_date or date.today()
    if history.last_date and as_of > history.last_date:
        raise ValueError(
            "The model cutoff must be on or before the last imported transaction date."
        )
    models = [ModelType(arguments.model)] if arguments.model else list(ModelType)
    results = [materialize(history, as_of, model, versions) for model in models]
    if not arguments.dry_run:
        artifacts = [
            save_artifact(
                evidence, estimator, arguments.artifact_dir, arguments.artifact_container_url
            )
            if evidence.status == "available"
            else None
            for evidence, _, estimator in results
        ]
        with engine.begin() as connection:
            if versions != source_versions(connection):
                raise ValueError(
                    "Source revisions changed during training. Retry before publishing."
                )
            for (evidence, rows, _), artifact in zip(results, artifacts, strict=True):
                publish(connection, evidence, rows, artifact)
    return [evidence for evidence, _, _ in results]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", choices=list(ModelType), help="Train one model. Default: both.")
    parser.add_argument(
        "--as-of", type=date.fromisoformat, help="YYYY-MM-DD. Default: last imported date."
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Print evaluation without writing SQL or artifacts."
    )
    artifacts = parser.add_mutually_exclusive_group()
    artifacts.add_argument(
        "--artifact-dir", type=Path, help="Local directory for versioned joblib artifacts."
    )
    artifacts.add_argument(
        "--artifact-container-url",
        type=validate_container_url,
        help="Private Azure Blob container URL.",
    )
    arguments = parser.parse_args()
    settings = Settings()
    if (
        not arguments.dry_run
        and (settings.sql_server or settings.environment == "development")
        and not arguments.artifact_container_url
    ):
        parser.error(
            "Publishing to Azure requires --artifact-container-url for a private container."
        )
    engine = create_database_engine(settings, connect_timeout=30, query_timeout=120)
    try:
        for evidence in run(engine, arguments):
            print(evidence.model_dump_json())
    except ValueError as error:
        parser.error(str(error))
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
