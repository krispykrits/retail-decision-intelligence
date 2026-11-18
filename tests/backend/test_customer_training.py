from datetime import date, timedelta
from decimal import Decimal

from retail_api.customers.definition import HORIZONS
from retail_api.customers.features import History, Ledger
from retail_api.customers.schemas import ModelType
from retail_api.customers.training import backtests, examples, train_model, training_examples

FIRST = date(2018, 1, 1)


def add(ledger: Ledger, day: date, spend: str, units: int) -> None:
    ledger.append(day.toordinal(), Decimal(spend), units, "EAST")


def test_cutoff_includes_only_past_activity_and_label_excludes_cutoff() -> None:
    cutoff = FIRST + timedelta(days=300)
    ledger = Ledger()
    add(ledger, cutoff - timedelta(days=180), "100", 1)
    add(ledger, cutoff - timedelta(days=179), "2", 2)
    add(ledger, cutoff, "3", 1)
    add(ledger, cutoff + timedelta(days=1), "-1", 0)
    add(ledger, cutoff + timedelta(days=60), "8", 0)
    add(ledger, cutoff + timedelta(days=61), "7", 1)
    add(ledger, cutoff + timedelta(days=90), "11", 1)
    add(ledger, cutoff + timedelta(days=91), "400", 1)
    history = History({"0010": ledger}, {}, FIRST, cutoff + timedelta(days=91))

    clv = examples(history, ModelType.CLV, cutoff)[0]
    churn = examples(history, ModelType.CHURN, cutoff)[0]
    assert clv.observation.spend == Decimal("5")
    assert clv.observation.purchase_days == 2
    assert clv.observation.last_purchase == cutoff
    assert clv.target == 25
    assert churn.target == 1

    for model in ModelType:
        rows = training_examples(history, model, cutoff)
        assert rows
        assert all(row.cutoff + timedelta(days=HORIZONS[model]) <= cutoff for row in rows)


def test_repeatable_out_of_time_training_with_nonoverlapping_labels() -> None:
    cutoff = FIRST + timedelta(days=600)
    ledgers = {}
    for index in range(60):
        ledger = Ledger()
        for day in range(0, 601, (index % 6) + 3):
            add(ledger, FIRST + timedelta(days=day), str(index * 3 + day % 40), 1)
        ledgers[str(index)] = ledger
    history = History(ledgers, {}, FIRST, cutoff)
    clv = backtests(history, ModelType.CLV, cutoff)
    assert len(clv) == 3
    assert all(fold.fold.validation_households == 60 for fold in clv)
    assert all(
        past.fold.target_through == later.fold.cutoff
        for past, later in zip(clv, clv[1:], strict=False)
    )
    assert clv[-1].fold.target_through == cutoff
    first, _ = train_model(history, ModelType.CLV, cutoff)
    second, _ = train_model(history, ModelType.CLV, cutoff)
    assert first == second
    assert first.primary_improvement_95_ci is not None
    assert first.candidate and first.candidate.mae is not None

    unsupported, estimator = train_model(history, ModelType.CHURN, cutoff)
    assert not unsupported.eligible
    assert not unsupported.folds
    assert estimator is None
