from fastapi import APIRouter, FastAPI

from . import health, plans, settings


def register_routes(app: FastAPI) -> None:
    router = APIRouter(prefix="/v1")

    router.include_router(health.router, tags=["health"])
    router.include_router(plans.router, prefix="/plans", tags=["plans"])
    router.include_router(settings.router, tags=["settings"])

    app.include_router(router)


__all__ = ["register_routes"]
