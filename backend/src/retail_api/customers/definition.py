from retail_api.customers.schemas import ModelType

HISTORY_DAYS = 180
HORIZONS = {ModelType.CLV: 90, ModelType.CHURN: 60}
TARGETS = {
    ModelType.CLV: "Net household spend over the next 90 days, a future-spend proxy for CLV.",
    ModelType.CHURN: "Probability of no positive-unit purchase in the next 60 days.",
}
POPULATION = "Households with a positive-unit purchase in the 180 days ending at the cutoff."
