"""Integration tests for schema validation enforcement across all data contracts."""

import json
from datetime import datetime

import jsonschema
import pytest

from shared.validation.schemas import (
    SchemaRegistry,
    validate_alert_acknowledge_request,
    validate_alert_escalate_request,
    validate_analytics_event_request,
    validate_allocator_response,
    validate_creative_response,
    validate_dashboard_response,
)


class TestAlertAcknowledgeRequestValidation:
    """Test AlertAcknowledgeRequest schema validation."""

    def test_valid_minimal_payload(self) -> None:
        """Minimal valid payload with no optional fields."""
        payload = {}
        # Should not raise
        validate_alert_acknowledge_request(payload)

    def test_valid_with_all_fields(self) -> None:
        """Payload with all fields populated."""
        payload = {
            "acknowledged_by": "user@example.com",
            "note": "Acknowledged and investigating issue",
        }
        validate_alert_acknowledge_request(payload)

    def test_acknowledged_by_max_length(self) -> None:
        """Acknowledged_by must not exceed 120 characters."""
        payload = {"acknowledged_by": "a" * 121}
        with pytest.raises(jsonschema.ValidationError):
            validate_alert_acknowledge_request(payload)

    def test_note_max_length(self) -> None:
        """Note must not exceed 500 characters."""
        payload = {"note": "a" * 501}
        with pytest.raises(jsonschema.ValidationError):
            validate_alert_acknowledge_request(payload)

    def test_null_values_allowed(self) -> None:
        """Null values are allowed for optional fields."""
        payload = {"acknowledged_by": None, "note": None}
        validate_alert_acknowledge_request(payload)

    def test_extra_fields_rejected(self) -> None:
        """Extra fields should be rejected due to additionalProperties: false."""
        payload = {
            "acknowledged_by": "user@example.com",
            "extra_field": "should fail",
        }
        with pytest.raises(jsonschema.ValidationError):
            validate_alert_acknowledge_request(payload)


class TestAlertEscalateRequestValidation:
    """Test AlertEscalateRequest schema validation."""

    def test_valid_payload(self) -> None:
        """Valid payload with required target."""
        payload = {
            "channel": "slack",
            "target": "oncall@example.com",
            "note": "Critical alert - needs immediate attention",
        }
        validate_alert_escalate_request(payload)

    def test_target_required(self) -> None:
        """Target field is required."""
        payload = {"channel": "slack"}
        with pytest.raises(jsonschema.ValidationError):
            validate_alert_escalate_request(payload)

    def test_channel_default_value(self) -> None:
        """Channel defaults to 'slack'."""
        payload = {"target": "oncall@example.com"}
        validate_alert_escalate_request(payload)

    def test_target_max_length(self) -> None:
        """Target must not exceed 120 characters."""
        payload = {"target": "a" * 121}
        with pytest.raises(jsonschema.ValidationError):
            validate_alert_escalate_request(payload)

    def test_channel_max_length(self) -> None:
        """Channel must not exceed 50 characters."""
        payload = {"target": "target@example.com", "channel": "a" * 51}
        with pytest.raises(jsonschema.ValidationError):
            validate_alert_escalate_request(payload)

    def test_note_max_length(self) -> None:
        """Note must not exceed 500 characters."""
        payload = {"target": "target@example.com", "note": "a" * 501}
        with pytest.raises(jsonschema.ValidationError):
            validate_alert_escalate_request(payload)


class TestAnalyticsEventRequestValidation:
    """Test DashboardSuggestionEventRequest schema validation."""

    def test_valid_view_event(self) -> None:
        """Valid view event payload."""
        payload = {
            "tenant_id": "tenant-123",
            "event": "dashboard.weather_focus.suggestion.view",
            "payload": {
                "region": "US-CA",
                "severity": "high",
                "high_risk_count": 2,
                "event_count": 5,
                "has_scheduled_start": True,
                "reason": "heavy_rain_forecast",
                "viewport_breakpoint": "desktop",
            },
            "occurred_at": "2024-01-01T12:00:00Z",
        }
        validate_analytics_event_request(payload)

    def test_valid_focus_event(self) -> None:
        """Valid focus event payload."""
        payload = {
            "tenant_id": "tenant-456",
            "event": "dashboard.weather_focus.suggestion.focus",
            "payload": {
                "region": "US-TX",
                "severity": "medium",
                "high_risk_count": 1,
                "event_count": 3,
                "has_scheduled_start": False,
                "reason": "temperature_spike",
                "viewport_breakpoint": "mobile",
                "metadata": {"click_position": "top-left"},
            },
            "occurred_at": "2024-01-02T10:30:00Z",
        }
        validate_analytics_event_request(payload)

    def test_tenant_id_required(self) -> None:
        """Tenant ID is required."""
        payload = {
            "event": "dashboard.weather_focus.suggestion.view",
            "payload": {
                "region": "US-CA",
                "severity": "high",
                "high_risk_count": 0,
                "event_count": 0,
                "has_scheduled_start": False,
                "reason": "test",
                "viewport_breakpoint": "desktop",
            },
            "occurred_at": "2024-01-01T12:00:00Z",
        }
        with pytest.raises(jsonschema.ValidationError):
            validate_analytics_event_request(payload)

    def test_invalid_event_type(self) -> None:
        """Event must be one of the allowed values."""
        payload = {
            "tenant_id": "tenant-123",
            "event": "invalid.event.type",
            "payload": {},
            "occurred_at": "2024-01-01T12:00:00Z",
        }
        with pytest.raises(jsonschema.ValidationError):
            validate_analytics_event_request(payload)

    def test_invalid_viewport_breakpoint(self) -> None:
        """Viewport breakpoint must be a valid value."""
        payload = {
            "tenant_id": "tenant-123",
            "event": "dashboard.weather_focus.suggestion.view",
            "payload": {
                "region": "US-CA",
                "severity": "high",
                "high_risk_count": 0,
                "event_count": 0,
                "has_scheduled_start": False,
                "reason": "test",
                "viewport_breakpoint": "invalid",
            },
            "occurred_at": "2024-01-01T12:00:00Z",
        }
        with pytest.raises(jsonschema.ValidationError):
            validate_analytics_event_request(payload)

    def test_high_risk_count_negative(self) -> None:
        """High risk count must be non-negative."""
        payload = {
            "tenant_id": "tenant-123",
            "event": "dashboard.weather_focus.suggestion.view",
            "payload": {
                "region": "US-CA",
                "severity": "high",
                "high_risk_count": -1,
                "event_count": 0,
                "has_scheduled_start": False,
                "reason": "test",
                "viewport_breakpoint": "desktop",
            },
            "occurred_at": "2024-01-01T12:00:00Z",
        }
        with pytest.raises(jsonschema.ValidationError):
            validate_analytics_event_request(payload)


class TestAllocatorResponseValidation:
    """Test allocator response schema validation."""

    def test_valid_shadow_report(self) -> None:
        """Valid shadow report response."""
        payload = {
            "report_type": "shadow",
            "tenant_id": "tenant-123",
            "generated_at": "2024-01-01T12:00:00Z",
            "mode": "autopilot",
            "total_spend": 10000.0,
        }
        validate_allocator_response(payload)

    def test_valid_saturation_report(self) -> None:
        """Valid saturation report response."""
        payload = {
            "report_type": "saturation",
            "generated_at": "2024-01-01T12:00:00Z",
            "total_spend_delta": -500.0,
            "total_spend_delta_pct": -5.0,
        }
        validate_allocator_response(payload)

    def test_report_type_required(self) -> None:
        """Report type is required."""
        payload = {"tenant_id": "tenant-123"}
        with pytest.raises(jsonschema.ValidationError):
            validate_allocator_response(payload)

    def test_invalid_report_type(self) -> None:
        """Report type must be one of: shadow, saturation."""
        payload = {"report_type": "invalid"}
        with pytest.raises(jsonschema.ValidationError):
            validate_allocator_response(payload)

    def test_invalid_mode(self) -> None:
        """Mode must be one of the allowed values."""
        payload = {
            "report_type": "shadow",
            "mode": "invalid",
        }
        with pytest.raises(jsonschema.ValidationError):
            validate_allocator_response(payload)


class TestDashboardResponseValidation:
    """Test dashboard response schema validation."""

    def test_valid_minimal_dashboard(self) -> None:
        """Minimal valid dashboard response."""
        payload = {
            "tenant_id": "tenant-123",
            "generated_at": "2024-01-01T12:00:00Z",
            "guardrails": [],
            "spend_trackers": [],
            "weather_events": [],
            "automation": [],
            "ingestion": [],
            "alerts": [],
            "weather_kpis": [],
            "suggestion_telemetry": [],
            "context_tags": [],
            "context_warnings": [],
        }
        validate_dashboard_response(payload)

    def test_valid_full_dashboard(self) -> None:
        """Full dashboard response with all fields populated."""
        payload = {
            "tenant_id": "tenant-123",
            "generated_at": "2024-01-01T12:00:00Z",
            "guardrails": [
                {
                    "name": "ROAS Floor",
                    "status": "healthy",
                    "value": 2.5,
                    "target": 2.0,
                    "unit": "pct",
                    "delta_pct": 25.0,
                }
            ],
            "spend_trackers": [
                {
                    "name": "Meta Ads",
                    "channel": "facebook",
                    "value": 5000.0,
                    "change_pct": 10.0,
                    "unit": "usd",
                }
            ],
            "weather_events": [
                {
                    "id": "event-1",
                    "title": "Heavy Rain",
                    "description": "Severe rain expected",
                    "severity": "high",
                    "geo_region": "US-CA",
                    "starts_at": "2024-01-01T14:00:00Z",
                    "ends_at": "2024-01-01T20:00:00Z",
                }
            ],
            "automation": [
                {
                    "name": "Auto-allocator",
                    "uptime_pct": 99.9,
                    "incidents_7d": 0,
                    "status": "normal",
                }
            ],
            "ingestion": [
                {
                    "name": "Shopify Orders",
                    "source": "shopify",
                    "status": "healthy",
                    "lag_minutes": 5,
                    "sla_minutes": 15,
                }
            ],
            "alerts": [
                {
                    "id": "alert-1",
                    "title": "High Spend Detected",
                    "detail": "Spend increased by 50%",
                    "severity": "warning",
                    "occurred_at": "2024-01-01T12:00:00Z",
                }
            ],
            "weather_kpis": [
                {
                    "id": "kpi-1",
                    "label": "Weather Impact",
                    "value": 15.0,
                    "unit": "pct",
                    "description": "Estimated revenue impact from weather",
                }
            ],
            "suggestion_telemetry": [
                {
                    "signature": "rain_forecast",
                    "region": "US-CA",
                    "reason": "heavy_rain",
                    "has_scheduled_start": True,
                    "view_count": 10,
                }
            ],
            "context_tags": ["production", "active"],
            "context_warnings": [
                {
                    "code": "LOW_CONFIDENCE",
                    "message": "Confidence below threshold",
                    "severity": "info",
                    "tags": ["model"],
                }
            ],
        }
        validate_dashboard_response(payload)

    def test_tenant_id_required(self) -> None:
        """Tenant ID is required."""
        payload = {
            "generated_at": "2024-01-01T12:00:00Z",
            "guardrails": [],
            "spend_trackers": [],
            "weather_events": [],
            "automation": [],
            "ingestion": [],
            "alerts": [],
            "weather_kpis": [],
            "suggestion_telemetry": [],
            "context_tags": [],
            "context_warnings": [],
        }
        with pytest.raises(jsonschema.ValidationError):
            validate_dashboard_response(payload)

    def test_guardrail_status_enum(self) -> None:
        """Guardrail status must be one of: healthy, watch, breach."""
        payload = {
            "tenant_id": "tenant-123",
            "generated_at": "2024-01-01T12:00:00Z",
            "guardrails": [
                {
                    "name": "Test",
                    "status": "invalid",
                    "value": 1.0,
                    "target": 1.0,
                }
            ],
            "spend_trackers": [],
            "weather_events": [],
            "automation": [],
            "ingestion": [],
            "alerts": [],
            "weather_kpis": [],
            "suggestion_telemetry": [],
            "context_tags": [],
            "context_warnings": [],
        }
        with pytest.raises(jsonschema.ValidationError):
            validate_dashboard_response(payload)


class TestCreativeResponseValidation:
    """Test creative response schema validation."""

    def test_valid_minimal_creative_response(self) -> None:
        """Minimal valid creative response."""
        payload = {
            "tenant_id": "tenant-123",
            "generated_at": "2024-01-01T12:00:00Z",
        }
        validate_creative_response(payload)

    def test_valid_full_creative_response(self) -> None:
        """Full creative response with all fields."""
        payload = {
            "tenant_id": "tenant-123",
            "generated_at": "2024-01-01T12:00:00Z",
            "summary": {
                "creative_count": 50,
                "active_creatives": 45,
                "blocked_creatives": 2,
                "watchlist_creatives": 3,
                "average_roas": 2.5,
                "median_roas": 2.3,
                "active_spend_share": 0.85,
                "watchlist_spend_share": 0.10,
                "blocked_spend_share": 0.05,
            },
            "policy": {
                "roas_floor": 1.5,
                "warn_threshold": 2.0,
                "block_threshold": 1.0,
                "min_impressions": 1000,
            },
            "highlights": [
                {
                    "creative_id": "creative-1",
                    "channel": "facebook",
                    "roas_adjusted": 3.2,
                    "brand_safety_score": 0.95,
                    "status": "active",
                }
            ],
            "rows": [],
            "by_channel": [],
            "context_warnings": [],
        }
        validate_creative_response(payload)

    def test_tenant_id_required(self) -> None:
        """Tenant ID is required."""
        payload = {"generated_at": "2024-01-01T12:00:00Z"}
        with pytest.raises(jsonschema.ValidationError):
            validate_creative_response(payload)

    def test_summary_creative_count_non_negative(self) -> None:
        """Creative counts must be non-negative."""
        payload = {
            "tenant_id": "tenant-123",
            "generated_at": "2024-01-01T12:00:00Z",
            "summary": {
                "creative_count": -1,
                "active_creatives": 45,
                "blocked_creatives": 2,
                "watchlist_creatives": 3,
                "average_roas": 2.5,
                "median_roas": 2.3,
                "active_spend_share": 0.85,
                "watchlist_spend_share": 0.10,
                "blocked_spend_share": 0.05,
            },
        }
        with pytest.raises(jsonschema.ValidationError):
            validate_creative_response(payload)


class TestSchemaRegistryIntegration:
    """Test SchemaRegistry integration."""

    def test_all_validators_registered(self) -> None:
        """All validators should be registered in SchemaRegistry."""
        validators = [
            "plan_response",
            "catalog_response",
            "stories_response",
            "reports_response",
            "automation_settings_response",
            "data_request_response",
            "onboarding_progress_response",
            "dashboard_response",
            "creative_response",
            "allocator_response",
            "alert_acknowledge_request",
            "alert_escalate_request",
            "analytics_event_request",
        ]

        for validator_name in validators:
            validator = SchemaRegistry.get_response_validator(validator_name)
            assert validator is not None, f"Validator '{validator_name}' not registered"

    def test_registry_validate_response(self) -> None:
        """SchemaRegistry.validate_response should work for all validators."""
        payload = {
            "tenant_id": "tenant-123",
            "generated_at": "2024-01-01T12:00:00Z",
            "guardrails": [],
            "spend_trackers": [],
            "weather_events": [],
            "automation": [],
            "ingestion": [],
            "alerts": [],
            "weather_kpis": [],
            "suggestion_telemetry": [],
            "context_tags": [],
            "context_warnings": [],
        }
        # Should not raise
        SchemaRegistry.validate_response("dashboard_response", payload)

    def test_registry_validate_response_invalid_validator(self) -> None:
        """SchemaRegistry should raise for unknown validators."""
        with pytest.raises(ValueError):
            SchemaRegistry.validate_response("unknown_validator", {})
