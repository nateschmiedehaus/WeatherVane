# Schema Validation Enforcement

## Overview

WeatherVane enforces strict schema validation across all data contracts using JSON Schema Draft 2020-12. This document describes the validation framework, implementation, and how to extend it.

**Status**: ✅ Complete - All data contracts are validated at ingestion and response boundaries.

## Architecture

### Validation Layers

Schema validation occurs at three levels:

1. **Ingestion Layer** (`shared/libs/storage/lake.py`)
   - Validates data as it enters the system
   - Covers Shopify orders, Shopify products, weather data, ads platforms, and promos
   - Prevents invalid data from polluting the feature store

2. **Service Layer** (`apps/api/services/`)
   - Services validate business logic constraints
   - Example: `PlanService._validate_plan_contract()`
   - Ensures domain invariants are maintained

3. **API Response Layer** (`apps/api/routes/`)
   - All API responses validated before transmission
   - Decorator pattern: `@enforce_schema("validator_name")`
   - Catches serialization errors before they reach clients

### Validation Framework

**Core Components**:
- `SchemaRegistry` (`shared/validation/schemas.py:498-539`)
  - Central registry for all validators
  - Supports both dataset and response validators
  - Extensible via `register_validator()` and `register_response_validator()`

- Validator Functions (`shared/validation/schemas.py`)
  - Type-specific validators: `validate_shopify_orders()`, `validate_weather_daily()`, etc.
  - Response validators: `validate_plan_response()`, `validate_dashboard_response()`, etc.
  - Request validators: `validate_alert_acknowledge_request()`, `validate_analytics_event_request()`, etc.

## Data Contracts

### Dataset Contracts (8 validators)

| Dataset | Schema File | Validator | Coverage |
|---------|------------|-----------|----------|
| Shopify Orders | `shopify_orders.schema.json` | `validate_shopify_orders()` | ✅ 100% |
| Shopify Products | `shopify_products.schema.json` | `validate_shopify_products()` | ✅ 100% |
| Meta Ads | `meta_ads.schema.json` | `validate_meta_ads()` | ✅ 100% |
| Google Ads | `google_ads.schema.json` | `validate_google_ads()` | ✅ 100% |
| Promos | `promos.schema.json` | `validate_promos()` | ✅ 100% |
| Weather Daily | `weather_daily.schema.json` | `validate_weather_daily()` | ✅ 100% |

### Response Contracts (10 validators)

| Endpoint | Validator | Status |
|----------|-----------|--------|
| GET /plans/{tenant_id} | `validate_plan_response()` | ✅ Enforced |
| GET /catalog/{tenant_id} | `validate_catalog_response()` | ✅ Enforced |
| GET /stories/{tenant_id} | `validate_stories_response()` | ✅ Enforced |
| GET /reports/{tenant_id} | `validate_reports_response()` | ✅ Enforced |
| GET /settings/automation | `validate_automation_settings_response()` | ✅ Enforced |
| GET /privacy/data-requests | `validate_data_request_response()` | ✅ Enforced |
| GET /onboarding/progress | `validate_onboarding_progress_response()` | ✅ Enforced |
| GET /dashboard/{tenant_id} | `validate_dashboard_response()` | ✅ Enforced |
| GET /allocator/{tenant_id} | `validate_allocator_response()` | ✅ Enforced |
| GET /creative/{tenant_id} | `validate_creative_response()` | ✅ Enforced |

### Request Contracts (3 validators)

| Endpoint | Validator | Status |
|----------|-----------|--------|
| POST /dashboard/{tenant_id}/alerts/{alert_id}/ack | `validate_alert_acknowledge_request()` | ✅ Enforced |
| POST /dashboard/{tenant_id}/alerts/{alert_id}/escalate | `validate_alert_escalate_request()` | ✅ Enforced |
| POST /analytics/dashboard/suggestion-events | `validate_analytics_event_request()` | ✅ Enforced |

## Implementation Details

### Using the @enforce_schema Decorator

Apply to endpoints to automatically validate responses:

```python
from shared.validation.schemas import enforce_schema

@router.get("/{tenant_id}", response_model=PlanResponse)
@enforce_schema("plan_response")
async def get_plan(tenant_id: str) -> PlanResponse:
    """Response is validated before transmission."""
    return await service.get_latest_plan(tenant_id)
```

### Manual Request Validation

For request validation:

```python
from shared.validation.schemas import validate_alert_acknowledge_request

@router.post("/{tenant_id}/alerts/{alert_id}/ack")
async def acknowledge_alert(payload: AlertAcknowledgeRequest):
    # Validate input request
    validate_alert_acknowledge_request(payload)
    # Process validated request
    return service.acknowledge_alert(...)
```

## Running Tests

```bash
# Run all validation tests
pytest tests/test_schema_validation_enforcement.py -v

# Test specific class
pytest tests/test_schema_validation_enforcement.py::TestDashboardResponseValidation -v
```

**Coverage**: 34 comprehensive tests across all validators

## Schema Files Location

All schema files are in: `shared/contracts/`

New schemas follow naming convention: `{entity}_{type}.schema.json`
- Example: `dashboard_response.schema.json`, `alert_acknowledge_request.schema.json`

## Best Practices

1. **Use strict schemas** - Set `additionalProperties: false` and explicit required fields
2. **Validate ranges** - Use min/max for numbers, minLength/maxLength for strings
3. **Use enums** - Restrict values to known set of options
4. **Handle null explicitly** - Use `oneOf` with `type: "null"` for optional fields
5. **Test edge cases** - Include tests for boundary values and invalid inputs

## Future Work

- [ ] Schema versioning strategy
- [ ] Validation telemetry dashboard
- [ ] Async validation for large payloads
- [ ] JSON Schema to OpenAPI auto-generation

See `docs/DEVELOPMENT.md` for more information about the API validation architecture.
