from __future__ import annotations

from datetime import datetime

import httpx
import pytest

from apps.api.services.automation_service import AutomationService
from apps.api.services.notifications import WebhookPublisher
from shared.data_context.models import ContextSnapshot
from shared.schemas.base import (
    AutomationConsent,
    AutomationMode,
    AutomationSettings,
    ConsentStatus,
    GuardrailSettings,
)


class FakePolicy:
    def __init__(self, tenant_id: str) -> None:
        self.tenant_id = tenant_id
        self.max_daily_budget_delta_pct = 15.0
        self.min_daily_spend = 0.0
        self.roas_floor = None
        self.cpa_ceiling = None
        self.change_windows: list[str] = []
        self.autopilot_mode = AutomationMode.manual.value
        self.pushes_enabled = False
        self.push_cap_daily = 0
        self.push_window_start_utc = None
        self.push_window_end_utc = None
        self.retention_days = 365
        self.last_export_at = None
        self.last_delete_at = None
        self.alerts: dict[str, object] = {}
        self.consent_status = ConsentStatus.pending.value
        self.consent_version = "1.0"
        self.consent_actor = None
        self.consent_recorded_at = None
        self.last_settings_update_at: datetime | None = None
        self.last_settings_actor: str | None = None


class StubAutomationRepository:
    def __init__(self, policy: FakePolicy) -> None:
        self.policy = policy

    async def fetch_policy(self, tenant_id: str) -> FakePolicy:
        return self.policy

    async def persist_policy(self, policy: FakePolicy) -> FakePolicy:
        policy.last_settings_update_at = datetime.utcnow()
        self.policy = policy
        return policy

    async def create_data_request(self, *args, **kwargs):  # pragma: no cover - not used in this test
        raise NotImplementedError


class StubAuditRepository:
    def __init__(self) -> None:
        self.entries: list[dict[str, object]] = []

    async def record(self, *, tenant_id: str, action: str, actor_type: str, actor_id, payload):
        self.entries.append(
            {
                "tenant_id": tenant_id,
                "action": action,
                "actor_type": actor_type,
                "actor_id": actor_id,
                "payload": payload,
            }
        )


class StubPublisher:
    def __init__(self, url: str) -> None:
        self.url = url
        self.events: list[dict[str, object]] = []

    async def publish(self, event: str, payload):  # type: ignore[no-untyped-def]
        self.events.append({"event": event, "payload": payload})


class StubContextService:
    def __init__(self, tenant_id: str, tags: list[str]) -> None:
        self._tenant = tenant_id
        self._tags = list(tags)
        self._snapshot = ContextSnapshot(
            tenant_id=tenant_id,
            created_at=datetime.utcnow(),
            dataset_profiles=[],
            tags=list(tags),
            metadata={},
        )

    def derive_tags(self, tenant_id: str, metadata=None):  # type: ignore[no-untyped-def]
        if tenant_id != self._tenant:
            return []
        return list(self._tags)

    def latest_snapshot(self, tenant_id: str):  # type: ignore[no-untyped-def]
        if tenant_id != self._tenant:
            return None
        return self._snapshot


@pytest.mark.asyncio
async def test_update_settings_emits_context_warnings():
    tenant_id = "alert-tenant"
    tags = ["history.short", "weather.stubbed"]
    policy = FakePolicy(tenant_id)
    repository = StubAutomationRepository(policy)
    audit_repo = StubAuditRepository()
    publisher = StubPublisher("https://example.test/webhook")
    context_service = StubContextService(tenant_id, tags)

    service = AutomationService(
        repository=repository,
        audit_repo=audit_repo,
        publisher=publisher,
        context_service=context_service,
    )

    payload = AutomationSettings(
        mode=AutomationMode.autopilot,
        pushes_enabled=True,
        daily_push_cap=3,
        push_window_start_utc="08:00",
        push_window_end_utc="18:00",
        guardrails=GuardrailSettings(
            max_daily_budget_delta_pct=12.0,
            min_daily_spend=50.0,
            roas_floor=1.6,
            cpa_ceiling=60.0,
            change_windows=["weekdays"],
        ),
        consent=AutomationConsent(
            status=ConsentStatus.granted,
            version="1.0",
            actor="ops@brand.com",
        ),
        retention_days=365,
        notes="Enable Autopilot under guardrails",
    )

    response = await service.update_settings(tenant_id, payload)

    assert response.context_tags == tags
    assert response.data_context is not None
    assert response.data_context.get("tags") == tags
    assert response.context_warnings
    assert any(warning.code == "history_short" for warning in response.context_warnings)
    assert any(warning.severity == "critical" for warning in response.context_warnings)

    assert "context" in repository.policy.alerts
    assert repository.policy.alerts["context"]["tags"] == tags

    assert publisher.events
    for event in publisher.events:
        payload = event["payload"]
        assert payload["context_tags"] == tags
        assert payload["data_context"]["tenant_id"] == tenant_id
        assert any(warning["code"] == "history_short" for warning in payload["context_warnings"])

    assert audit_repo.entries


@pytest.mark.asyncio
async def test_webhook_publisher_sets_context_headers(monkeypatch):
    captured: dict[str, object] = {}

    class DummyAsyncClient:
        def __init__(self, *args, **kwargs):
            captured["client_kwargs"] = kwargs

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url: str, json=None, headers=None):
            captured["url"] = url
            captured["json"] = json
            captured["headers"] = headers

    monkeypatch.setattr(httpx, "AsyncClient", DummyAsyncClient)

    publisher = WebhookPublisher("https://example.test/webhook")
    await publisher.publish(
        "automation.settings.updated",
        {
            "tenant_id": "demo",
            "context_tags": ["history.short", "weather.stubbed"],
            "context_warnings": [
                {"code": "history_short"},
                {"code": "weather_stubbed"},
            ],
        },
    )

    assert captured["url"] == "https://example.test/webhook"
    headers = captured.get("headers") or {}
    assert headers.get("X-WeatherVane-Context") == "history.short,weather.stubbed"
    assert headers.get("X-WeatherVane-Warnings") == "history_short,weather_stubbed"
