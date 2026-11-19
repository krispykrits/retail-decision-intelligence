from argparse import ArgumentParser, Namespace
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from retail_api.customers.schemas import ModelType


class ClvParameters(BaseModel):
    loss: Literal["absolute_error", "squared_error"] = "absolute_error"
    learning_rate: float = Field(default=0.1, gt=0, allow_inf_nan=False)
    max_iter: int = Field(default=80, ge=1)
    max_leaf_nodes: int = Field(default=12, ge=2)
    min_samples_leaf: int = Field(default=25, ge=1)
    l2_regularization: float = Field(default=4.0, ge=0, allow_inf_nan=False)
    random_state: int = Field(default=42, ge=0, le=2**32 - 1)


class ChurnParameters(BaseModel):
    max_iter: int = Field(default=1000, ge=1)
    C: float = Field(default=1.0, gt=0, allow_inf_nan=False)
    tol: float = Field(default=1e-4, gt=0, allow_inf_nan=False)
    class_weight: Literal["balanced"] | None = None


ModelParameters = ClvParameters | ChurnParameters


def defaults(model: ModelType) -> ModelParameters:
    return ClvParameters() if model is ModelType.CLV else ChurnParameters()


def add_arguments(parser: ArgumentParser) -> None:
    clv = parser.add_argument_group("CLV hyperparameters")
    clv.add_argument("--clv-loss", choices=("absolute_error", "squared_error"))
    clv.add_argument("--clv-learning-rate", type=float, help="Boosting step size (default: 0.1).")
    clv.add_argument("--clv-max-iter", type=int, help="Boosting iterations (default: 80).")
    clv.add_argument("--clv-max-leaf-nodes", type=int, help="Leaves per tree (default: 12).")
    clv.add_argument("--clv-min-samples-leaf", type=int, help="Samples per leaf (default: 25).")
    clv.add_argument(
        "--clv-l2-regularization", type=float, help="L2 regularization strength (default: 4)."
    )
    clv.add_argument("--clv-random-state", type=int, help="Estimator seed (default: 42).")

    churn = parser.add_argument_group("Churn hyperparameters")
    churn.add_argument("--churn-max-iter", type=int, help="Solver iteration limit (default: 1000).")
    churn.add_argument("--churn-c", type=float, help="Inverse regularization (default: 1).")
    churn.add_argument("--churn-tol", type=float, help="Convergence tolerance (default: 0.0001).")
    churn.add_argument("--churn-class-weight", choices=("balanced",), help="Balance class weights.")


def parameters_from_args(arguments: Namespace, model: ModelType) -> ModelParameters:
    prefix = f"{model.value}_"
    options = {
        key.removeprefix(prefix): value
        for key, value in vars(arguments).items()
        if key.startswith(prefix) and value is not None
    }
    if arguments.model and arguments.model != model and options:
        raise ValueError(f"{model.value.upper()} settings require the {model.value} model.")
    try:
        if model is ModelType.CLV:
            return ClvParameters.model_validate(options)
        if "c" in options:
            options["C"] = options.pop("c")
        return ChurnParameters.model_validate(options)
    except ValidationError as error:
        raise ValueError(f"Invalid {model.value} hyperparameters: {error}") from error
