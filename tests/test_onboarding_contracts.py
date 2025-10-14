from __future__ import annotations

from datetime import datetime, timezone
import jsonschema
import pytest
from fastapi import HTTPException

from apps.api.routes.onboarding import fetch_onboarding_progress
from apps.api.schemas.onboarding import OnboardingMode
from shared.services.onboarding.models import (
    AutomationAuditRecord,
    ConnectorProgressRecord,
    OnboardingSnapshot,
)


def _snapshot(tenant_id: str) -> OnboardingSnapshot:
    connector = ConnectorProgressRecord(
        slug="shopify",
        label="Shopify",
        status="ready",
        progress=100,
        summary="Synced",
        action=None,
        updated_at=datetime.now(timezone.utc),
    )
    audit = AutomationAuditRecord(
        id=f"{tenant_id}-audit",
        status="shadow",
        headline="Shadow mode",
        detail=None,
        actor="system",
        occurred_at=datetime.now(timezone.utc),
    )
    return OnboardingSnapshot(
        tenant_id=tenant_id,
        mode=OnboardingMode.DEMO,
        connectors=[connector],
        audits=[audit],
        fallback_reason=None,
    )


@pytest.mark.asyncio
async def test_fetch_onboarding_progress_raises_when_schema_validation_fails(monkeypatch):
    async def _stub_snapshot(tenant_id: str, mode: OnboardingMode):
        return _snapshot(tenant_id)

    def _broken_validator(payload):
        raise jsonschema.ValidationError("invalid", path=["connectors", 0, "slug"])

    monkeypatch.setattr(
        "apps.api.routes.onboarding.get_onboarding_snapshot",
        _stub_snapshot,
    )
    monkeypatch.setattr(
        "apps.api.routes.onboarding.validate_onboarding_progress_response",
        _broken_validator,
    )

    with pytest.raises(HTTPException) as excinfo:
        await fetch_onboarding_progress(tenant_id="tenant-abc", mode=OnboardingMode.DEMO)

    assert excinfo.value.status_code == 500
    assert excinfo.value.detail["schema"] == "onboarding_progress_response"
    assert excinfo.value.detail["tenant_id"] == "tenant-abc"
