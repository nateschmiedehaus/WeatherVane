"""Prefect flow exports with lazy loading to avoid heavy optional deps."""

__all__ = [
    "orchestrate_poc_flow",
    "orchestrate_causal_uplift_flow",
    "orchestrate_creative_response_flow",
]


def __getattr__(name: str):
    if name == "orchestrate_poc_flow":
        from .poc_pipeline import orchestrate_poc_flow

        return orchestrate_poc_flow
    if name == "orchestrate_causal_uplift_flow":
        from .causal_uplift_pipeline import orchestrate_causal_uplift_flow

        return orchestrate_causal_uplift_flow
    if name == "orchestrate_creative_response_flow":
        from .creative_response_pipeline import orchestrate_creative_response_flow

        return orchestrate_creative_response_flow
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
