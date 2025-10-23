# Schema Validation & Data Contracts Audit Report

## Executive Summary

WeatherVane has a moderately comprehensive schema validation framework with JSON Schema contracts and Pydantic models covering most major API responses and data formats. The system includes validation at multiple layers (ingestion, service, API), but there are gaps in coverage and enforcement consistency across the platform.

---

## Current Schema Validation Coverage

### 1. JSON Schema Contracts (16 Files)

Located in `/shared/contracts/`:

**Data Schema Files:**
- `shopify_orders.schema.json` - Order ingestion contract
- `shopify_products.schema.json` - Product catalog contract
- `meta_ads.schema.json` - Meta advertising data
- `google_ads.schema.json` - Google advertising data
- `weather_daily.schema.json` - Daily weather observations
- `promos.schema.json` - Promotional campaign data
- `plan_slice.schema.json` - Individual plan recommendations
- `plan_status.schema.json` - Plan status tracking
- `feature_matrix.schema.json` - ML feature vectors

**API Response Schema Files:**
- `catalog_response.schema.json` - Catalog API contract
- `stories_response.schema.json` - Weather stories API contract
- `reports_response.schema.json` - Reports API contract
- `automation_settings_response.schema.json` - Automation settings contract
- `data_request_response.schema.json` - Data request/export contract
- `onboarding_progress_response.schema.json` - Onboarding status contract

**Format:** All use JSON Schema Draft 2020-12

### 2. Pydantic Schema Models

Located in `/shared/schemas/`:

**Core Models (`base.py`):**
- `APIModel` - Base model with `from_attributes=True` config
- `PlanResponse` - Main plan delivery contract
- `PlanSlice` - Individual plan day/geo/channel slice
- `PlanQuantiles` - Revenue/ROAS probability distributions (p10, p50, p90)
- `PlanRationale` - Reasoning for recommendations
- `CatalogResponse` - Product categorization response
- `StoriesResponse` - Weather narrative stories
- `ReportsResponse` - Campaign performance reports
- `AutomationSettingsResponse` - Automation configuration
- `DataRequestResponse` - Data export/deletion tracking
- `ScenarioSnapshot` - What-if analysis scenarios
- `ExperimentPayload` - Experiment design and results
- `ExperimentLift` - Statistical lift metrics
- `ContextWarning` - Context-aware warnings

**Specialized Models:**
- `creative.py` - Creative content schemas
- `allocator.py` - Budget allocation schemas
- `dashboard.py` - Dashboard display schemas
- `coverage.py` - Geographic coverage schemas
- `incrementality.py` - Incrementality test schemas
- `product_taxonomy.py` - Product categorization

### 3. Validation Infrastructure

**Core Validation Module:** `/shared/validation/schemas.py`
- ~600 lines of validation code
- 20+ validation functions
- `SchemaRegistry` class for centralized validator registration
- `enforce_schema` decorator for automatic response validation

**Features:**
- `jsonschema` library (Draft202012Validator)
- Type coercion helpers (`_coerce_mapping`, `_ensure_primitive`)
- Response payload normalizers for datetime/enum conversion
- Support for both ingestion and response validation
- Polars DataFrame validation support

### 4. Validation Integration Points

**Ingestion Layer:**
- `LakeWriter.write_records()` - Validates dataset records before persisting
- Integrates with `/shared/validation/schemas.py`
- Calls `validate_dataset_records()` with dataset name matching

**Service Layer:**
- `PlanService._validate_plan_contract()` - Validates plan responses
- `PlanService` uses `SchemaRegistry.validate_response()`
- Service-level `SchemaValidationError` exception handling

**API Routes:**
- FastAPI `response_model` parameter provides Pydantic validation
- Routes in `/apps/api/routes/` catch `SchemaValidationError` and return HTTP 500
- Response headers include context tags and warnings (e.g., `X-WeatherVane-Context`)

**Frontend Validation:**
- `/apps/web/src/lib/automationValidation.ts` - TypeScript validation for automation settings
- Client-side field-level validation for:
  - Daily push cap bounds
  - Time window format and logic
  - Budget guardrail ranges
  - Change window tokens

---

## Data Contracts Mapping

### Ingestion Contracts

| Dataset | Schema File | Validator | Status |
|---------|------------|-----------|--------|
| Shopify Orders | shopify_orders.schema.json | validate_shopify_orders | Registered |
| Shopify Products | shopify_products.schema.json | validate_shopify_products | Registered |
| Meta Ads | meta_ads.schema.json | validate_meta_ads | Registered |
| Google Ads | google_ads.schema.json | validate_google_ads | Registered |
| Weather Daily | weather_daily.schema.json | validate_weather_daily | Registered |
| Promos | promos.schema.json | validate_promos | Registered |
| Plan Slices | plan_slice.schema.json | validate_plan_slices | Registered |

### API Response Contracts

| Endpoint | Schema | Validator | Status |
|----------|--------|-----------|--------|
| /plans/{tenant_id} | N/A (Pydantic) | validate_plan_response | Registered |
| /catalog/{tenant_id} | catalog_response.schema.json | validate_catalog_response | Registered |
| /stories/{tenant_id} | stories_response.schema.json | validate_stories_response | Registered |
| /reports/{tenant_id} | reports_response.schema.json | validate_reports_response | Registered |
| /settings/{tenant_id} | automation_settings_response.schema.json | validate_automation_settings_response | Registered |
| /privacy/requests | data_request_response.schema.json | validate_data_request_response | Registered |
| /onboarding/{tenant_id} | onboarding_progress_response.schema.json | validate_onboarding_progress_response | Registered |

---

## What's Missing or Incomplete

### 1. Gaps in Schema Coverage

**Missing Schemas:**
- **Dashboard Data** - `/apps/api/routes/dashboard.py` has no schema validation
- **Ad Push Operations** - `/apps/api/routes/ad_push.py` lacks request/response contracts
- **Allocator Output** - `/apps/api/routes/allocator.py` uses unvalidated dict responses
- **Creative Data** - `/apps/api/routes/creative.py` operates on loose dicts
- **Experiments Full Lifecycle** - Only response schemas, missing request/design validation
- **Scenario Recommendations** - `ScenarioRecommendationResponse` lacks JSON schema equivalent
- **Analytics Endpoints** - `/apps/api/routes/analytics.py` completely unvalidated
- **Operations Endpoints** - `/apps/api/routes/operations.py` completely unvalidated
- **Weather Raw Data** - `/apps/api/routes/weather.py` unvalidated

**Ingestion Gaps:**
- No validation for ML feature store outputs
- No validation for incremental experiment results
- No contracts for internal state/cache payloads

### 2. Inconsistent Enforcement

**Where Validation Happens:**
- API responses: Mixed (some use @enforce_schema decorator, some rely on Pydantic)
- Ingestion: Happens in LakeWriter but not all paths go through LakeWriter
- Services: PlanService validates, but not all services do
- Frontend: Only automation settings validated, other forms unvalidated

**Where Validation Is Missing:**
- Incoming request payloads (no input schema validation)
- Internal state storage (orchestrator.db, policy files, etc.)
- Model outputs before persisting
- Feature engineering pipeline outputs
- Consensus engine decision payloads
- Telemetry/metrics data

### 3. Schema Definition Gaps

**Under-specified Schemas:**
- `plan_slice.schema.json` - Has `"additionalProperties": true`, allowing unknown fields
- `feature_matrix.schema.json` - No constraints on numeric ranges
- Weather schema - No validation of realistic temperature/precipitation ranges
- Ads schemas - No validation of budget/spend bounds

**No Constraint Validation:**
- Numeric field bounds (ROAS > 0, budget >= 0, etc.)
- Enum strictness inconsistent
- Date/time format not always enforced
- Array size constraints missing

**Incomplete Rationale:**
- No unified pattern for "data quality" field values
- "Confidence level" enum not enforced in all contexts
- Error/warning message formats not standardized

### 4. Test Coverage Issues

**Test Files Found:**
- `/tests/test_schema_validation.py` - Basic dataset validation tests
- `/tests/test_schema_enforcement.py` - Response validator tests (520+ lines)
- `/tests/test_plan_service_contracts.py` - Service-level validation
- Other contract tests for catalog, stories, reports, automation, onboarding

**Gaps:**
- No validation of ingestion pipeline (no tests for LakeWriter + validators together)
- No negative tests for all rejectable payloads
- Frontend validation (`automationValidation.ts`) has no test file
- No end-to-end tests for schema evolution/backwards compatibility
- No performance tests for large payloads

### 5. Validation Configuration Issues

**Hardcoded Limits:**
- Data quality min_rows: 90 (hard-coded in `DataQualityConfig`)
- No per-tenant or per-dataset tuning
- No versioning of schema evolution

**No Input Validation:**
- Request bodies not validated against schemas
- Query parameter constraints not enforced
- No request rate limiting or size constraints

**Missing Error Context:**
- Validation errors don't identify which field/record failed
- No telemetry on validation failures
- No retry guidance for transient failures

---

## Files That Need Updates

### Priority 1: High Impact (Core APIs)

1. **`/apps/api/routes/dashboard.py`**
   - Create `dashboard_response.schema.json`
   - Add Pydantic model to `shared/schemas/dashboard.py`
   - Update validation in route handlers

2. **`/apps/api/routes/allocator.py`**
   - Create `allocator_response.schema.json`
   - Define Pydantic `AllocatorResponse` model
   - Add response validation

3. **`/apps/api/routes/creative.py`**
   - Create `creative_response.schema.json`
   - Create Pydantic models in `shared/schemas/creative.py`
   - Add validation throughout pipeline

4. **`/apps/api/routes/analytics.py`**
   - Define contracts for analytics endpoints
   - Create schema files for each analytics output type

5. **`/apps/api/services/plan_service.py`**
   - Add `_validate_plan_contract()` implementation (currently a stub)
   - Enhance validation error messages

### Priority 2: Medium Impact (Ingestion & Processing)

6. **`/apps/worker/validation.py`** (if exists)
   - Add validation for experiment results before persisting
   - Validate ML model outputs

7. **`/shared/libs/storage/lake.py`**
   - Enhance error messages when validation fails
   - Add validation result telemetry

8. **`/shared/validation/schemas.py`**
   - Add input schema validators for all request types
   - Create unified error handling
   - Add field-level error reporting

9. **`/tools/wvo_mcp/src/orchestrator/**` (consensus & state)**
   - Add schemas for consensus payloads
   - Validate decision outputs
   - Validate state mutations

### Priority 3: Test & Automation

10. **`/tests/test_schema_validation.py`**
    - Add negative test cases for all rejectable payloads
    - Add performance tests for large datasets

11. **`/tests/test_schema_enforcement.py`**
    - Add tests for new dashboard, allocator, creative schemas
    - Add request payload validation tests

12. **Create new test file: `/tests/integration/test_ingestion_validation.py`**
    - End-to-end validation from ingestion to API response
    - Test validation error propagation

13. **Create frontend test: `/tests/web/automation_validation.spec.ts`**
    - Unit tests for `automationValidation.ts`
    - Edge case coverage for time windows, bounds, etc.

### Priority 4: Documentation & Governance

14. **Create `/docs/SCHEMA_VALIDATION_GUIDE.md`**
    - How to add new schemas
    - Validation registration pattern
    - Error handling best practices

15. **Create `/tools/schema_registry_generator.py`**
    - Auto-generate validators from Pydantic models
    - Create test fixtures from schemas
    - Validate schema completeness

16. **Update `/shared/contracts/`**
    - Add `additionalProperties: false` to all schemas
    - Add numeric bounds and constraints
    - Document breaking changes

---

## Validation Enforcement Mechanisms

### Currently Implemented

1. **JSON Schema Validation**
   - Using `jsonschema.Draft202012Validator`
   - Applied at ingestion (LakeWriter) and response generation
   - Type coercion for Enums and datetimes

2. **Pydantic Model Validation**
   - Applied at API layer via FastAPI's `response_model`
   - `from_attributes=True` for ORM compatibility
   - Field-level constraints

3. **Decorator-based Enforcement**
   - `@enforce_schema()` decorator for wrapping functions
   - Applied selectively to plan response generation

4. **Service-level Exceptions**
   - `SchemaValidationError` custom exception
   - HTTP 500 responses on validation failure
   - Context tags and warning headers in responses

### What's Missing

1. **Input Validation Middleware**
   - No middleware to validate request bodies
   - No automatic rejection of malformed requests before routing

2. **Validation Hooks**
   - No pre-save validators for database models
   - No post-mutation validators for state changes

3. **Schema Evolution**
   - No deprecation markers for schema changes
   - No backwards-compatibility checks
   - No migration guidance for contract changes

4. **Observability**
   - No metrics on validation failures by schema
   - No per-tenant validation health monitoring
   - No validation latency tracking

---

## Recommendations

### Immediate Actions (This Week)

1. **Add input validation middleware** to catch request payload errors before routing
2. **Create missing API schemas** for dashboard, allocator, creative endpoints
3. **Add negative test cases** to ensure rejection of invalid payloads
4. **Document schema registration pattern** with examples

### Short Term (This Month)

5. **Implement request body validation** for all POST/PUT endpoints
6. **Add field-level error reporting** to validation exceptions
7. **Create schema versioning** strategy for breaking changes
8. **Add validation telemetry** (failures, latency, coverage metrics)

### Medium Term (This Quarter)

9. **Auto-generate validators** from Pydantic models to reduce duplication
10. **Implement schema evolution** with deprecation warnings
11. **Add performance validation** (payload size limits, nesting depth, etc.)
12. **Comprehensive test suite** covering all schema edge cases

### Long Term (This Year)

13. **Migrate to OpenAPI/AsyncAPI** for unified contract definition
14. **Implement runtime schema discovery** for dynamic validation
15. **Add cross-service contract testing** in CI/CD
16. **Build schema governance** with approval workflows for changes

---

## Code Examples: Current Patterns

### Example 1: Registering a Validator

```python
# In shared/validation/schemas.py
def validate_my_data(records):
    for record in _iter_schema_records(records):
        _my_data_validator.validate(record)

SchemaRegistry.register_validator("my_data", validate_my_data)
```

### Example 2: Using in LakeWriter

```python
# In shared/libs/storage/lake.py
def write_records(self, dataset: str, records):
    if records:
        validate_dataset_records(dataset, records)
    frame = pl.DataFrame(records)
    # ... write to parquet
```

### Example 3: Service-level Validation

```python
# In apps/api/services/plan_service.py
def _to_schema(self, plan: models.Plan) -> PlanResponse:
    response = PlanResponse(...)
    self._validate_plan_contract(response)  # Note: currently stub
    return response
```

### Example 4: API Response Validation

```python
# In apps/api/routes/plans.py
@router.get("/{tenant_id}", response_model=PlanResponse)
async def get_plan(tenant_id: str, service: PlanService):
    try:
        plan = await service.get_latest_plan(tenant_id)
    except SchemaValidationError as exc:
        raise HTTPException(status_code=500, detail=exc.to_detail())
    return plan
```

---

## Summary Statistics

- **Total Schema Files:** 16 JSON schemas + 7 Pydantic model files
- **Registered Validators:** 13 (dataset) + 7 (response)
- **Test Coverage:** ~520 lines in enforcement tests, ~150 in validation tests
- **Validation Entry Points:** 3 (ingestion, services, API)
- **Missing Schemas:** ~10 major API endpoints
- **Incomplete Enforcement:** ~5 major service paths

