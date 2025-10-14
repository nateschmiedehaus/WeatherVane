"""Onboarding progress routes."""

from __future__ import annotations

import logging

import jsonschema
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import ValidationError

from apps.api.schemas.onboarding import (
    OnboardingEventRequest,
    OnboardingEventResponse,
    OnboardingMode,
    OnboardingProgressResponse,
)
from apps.api.services.exceptions import SchemaValidationError
from shared.services.onboarding import get_onboarding_snapshot, record_onboarding_event
from shared.validation.schemas import validate_onboarding_progress_response

router = APIRouter(prefix="/onboarding", tags=["onboarding"])

logger = logging.getLogger(__name__)


@router.get("/progress", response_model=OnboardingProgressResponse)
async def fetch_onboarding_progress(
    tenant_id: str = Query(..., description="Tenant identifier requesting onboarding data."),
    mode: OnboardingMode = Query(
        default=OnboardingMode.DEMO,
        description="Source mode for onboarding data (demo or live).",
    ),
) -> OnboardingProgressResponse:
    """Return onboarding progress snapshot for a tenant."""

    try:
        snapshot = await get_onboarding_snapshot(tenant_id=tenant_id, mode=mode)
        response_payload = OnboardingProgressResponse.from_snapshot(snapshot)
        try:
            validate_onboarding_progress_response(response_payload)
        except (jsonschema.ValidationError, jsonschema.SchemaError) as error:
            if isinstance(error, jsonschema.ValidationError):
                path = list(error.absolute_path)
                reason = error.message
            else:
                path = []
                reason = str(error)
            logger.exception(
                "Onboarding progress schema validation failed for tenant %s at %s: %s",
                tenant_id,
                path or "<root>",
                reason,
            )
            raise SchemaValidationError(
                "Onboarding progress contract violated",
                schema="onboarding_progress_response",
                tenant_id=tenant_id,
                path=path,
                reason=reason,
            ) from error
        return response_payload
    except SchemaValidationError as exc:
        raise HTTPException(status_code=500, detail=exc.to_detail()) from exc
    except ValidationError as exc:
        errors = exc.errors()
        first = errors[0] if errors else {}
        path = list(first.get("loc", ()))
        reason = first.get("msg")
        schema_error = SchemaValidationError(
            "Onboarding progress contract violated",
            schema="onboarding_progress",
            tenant_id=tenant_id,
            path=path,
            reason=reason,
        )
        raise HTTPException(status_code=500, detail=schema_error.to_detail()) from exc


@router.post(
    "/events",
    response_model=OnboardingEventResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def record_onboarding_event_telemetry(
    payload: OnboardingEventRequest,
) -> OnboardingEventResponse:
    """Record onboarding telemetry events."""

    event = payload.to_event()
    record_onboarding_event(event)
    return OnboardingEventResponse()
