from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any

import jsonschema
import pytest

from apps.api.services.automation_service import AutomationService
from apps.api.services.exceptions import SchemaValidationError
from shared.schemas.base import DataRequestPayload, DataRequestType


class _StubPolicy(SimpleNamespace):
    """Container for guardrail policy attributes used in automation service."""


def _policy() -> _StubPolicy:
    return _StubPolicy(
        tenant_id="tenant-automation",
        max_daily_budget_delta_pct=15.0,
        min_daily_spend=0.0,
        roas_floor=None,
        cpa_ceiling=None,
        change_windows=[],
        autopilot_mode="manual",
        pushes_enabled=False,
        push_cap_daily=0,
        push_window_start_utc=None,
        push_window_end_utc=None,
        retention_days=365,
        last_export_at=None,
        last_delete_at=None,
        last_settings_update_at=None,
        last_settings_actor=None,
        consent_status="pending",
        consent_version="1.0",
        consent_recorded_at=None,
        consent_actor=None,
        alerts=None,
    )


class _StubAutomationRepository:
    def __init__(self) -> None:
        self.policy = _policy()

    async def fetch_policy(self, tenant_id: str):
        return self.policy

    async def persist_policy(self, policy):
        return policy

    async def create_data_request(
        self,
        tenant_id: str,
        request_type: str,
        requested_by: str | None = None,
        notes: str | None = None,
    ):
        return SimpleNamespace(
            id=1,
            tenant_id=tenant_id,
            request_type=request_type,
            status="pending",
            requested_by=requested_by,
            requested_at=datetime.now(timezone.utc),
            processed_at=None,
        )


class _StubAuditRepository:
    async def record(self, *args: Any, **kwargs: Any):
        return None


class _StubPublisher:
    url = None


class _StubContextService:
    def derive_tags(self, tenant_id: str, metadata: dict[str, Any] | None = None):
        return ["demo"]

    def latest_snapshot(self, tenant_id: str):
        return None


class _StubWarningEngine:
    def evaluate(self, tags, autopilot_enabled: bool, pushes_enabled: bool):
        return []


def _service() -> AutomationService:
    return AutomationService(
        repository=_StubAutomationRepository(),
        audit_repo=_StubAuditRepository(),
        publisher=_StubPublisher(),
        context_service=_StubContextService(),
        warning_engine=_StubWarningEngine(),
    )


@pytest.mark.asyncio
async def test_automation_get_settings_raises_when_schema_validation_fails(monkeypatch):
    service = _service()

    def _broken_validator(payload):
        raise jsonschema.ValidationError("invalid", path=["settings", "mode"])

    monkeypatch.setattr(
        "apps.api.services.automation_service.validate_automation_settings_response",
        _broken_validator,
    )

    with pytest.raises(SchemaValidationError) as excinfo:
        await service.get_settings("tenant-automation")

    assert excinfo.value.schema == "automation_settings_response"
    assert excinfo.value.tenant_id == "tenant-automation"
    assert tuple(excinfo.value.path) == ("settings", "mode")


@pytest.mark.asyncio
async def test_automation_create_data_request_raises_when_schema_validation_fails(monkeypatch):
    service = _service()

    def _broken_validator(payload):
        raise jsonschema.ValidationError("invalid", path=["status"])

    monkeypatch.setattr(
        "apps.api.services.automation_service.validate_data_request_response",
        _broken_validator,
    )

    payload = DataRequestPayload(requested_by="owner", notes=None)

    with pytest.raises(SchemaValidationError) as excinfo:
        await service.create_data_request(
            "tenant-automation",
            request_type=DataRequestType.export,
            payload=payload,
        )

    assert excinfo.value.schema == "data_request_response"
    assert excinfo.value.tenant_id == "tenant-automation"
