import logging
import os

from fastapi import APIRouter, FastAPI

from . import audit, catalog, health, plans, privacy, settings, stories

LOGGER = logging.getLogger(__name__)


def register_routes(app: FastAPI) -> None:
    router = APIRouter(prefix="/v1")

    router.include_router(health.router, tags=["health"])
    router.include_router(plans.router, prefix="/plans", tags=["plans"])
    router.include_router(settings.router, tags=["settings"])
    router.include_router(privacy.router, prefix="/privacy", tags=["privacy"])
    router.include_router(stories.router, tags=["stories"])
    router.include_router(catalog.router, tags=["catalog"])
    router.include_router(audit.router, tags=["audit"])

    if os.getenv("WEATHERVANE_DISABLE_EXPERIMENTS_ROUTES") == "1":
        LOGGER.warning("Experiments routes disabled via environment override")
    else:
        try:
            from . import experiments
        except Exception as exc:  # pragma: no cover - optional route
            LOGGER.warning("Experiments routes unavailable: %s", exc, exc_info=False)
        else:
            router.include_router(experiments.router, prefix="/experiments", tags=["experiments"])

    app.include_router(router)


__all__ = ["register_routes"]
