from retail_api.customers.schemas import ModelType

HISTORY_DAYS = 180
HORIZONS = {ModelType.CLV: 90, ModelType.CHURN: 60}
TARGETS = {
    ModelType.CLV: "Net household spend over the next 90 days, a future-spend proxy for CLV.",
    ModelType.CHURN: "Probability of no positive-unit purchase in the next 60 days.",
}
POPULATION = "Households with a positive-unit purchase in the 180 days ending at the cutoff."
FEATURES = {
    "recency": "Days since the last positive-unit purchase at the cutoff",
    **{
        f"{field}_{days}d": f"{description} in the {days} days ending at the cutoff"
        for days in (30, 90, 180)
        for field, description in (
            ("net_spend", "Net spend including returns"),
            ("purchase_days", "Distinct days with a positive-unit purchase"),
            ("purchase_units", "Positive units purchased"),
        )
    },
}
CAVEATS = [
    "Activity and outcomes cover purchases recorded in the imported data.",
    "Validation measures predictive accuracy at historical cutoffs.",
    "The confidence interval resamples households and describes improvement over the baseline.",
    "Region uses the most positive units on the last purchase day, with alphabetical ties.",
]
