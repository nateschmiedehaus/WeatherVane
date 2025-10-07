from fastapi import APIRouter

from shared.schemas.base import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Return API health status."""

    return HealthResponse()
