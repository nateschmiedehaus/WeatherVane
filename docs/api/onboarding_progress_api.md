# Onboarding Progress API

## Overview

The Onboarding Progress API provides real-time visibility into tenant onboarding status across all data connectors (Shopify, Meta Ads, Google Ads, Klaviyo) and automation audit events. This API powers the WeatherVane onboarding dashboard and enables tracking of integration progress, data sync status, and automation readiness.

**Base URL**: `/v1/onboarding`

**Version**: 1.0

**Last Updated**: October 21, 2025

---

## Endpoints

### GET /onboarding/progress

Fetch the current onboarding progress snapshot for a tenant, including connector statuses and recent automation audit events.

#### Request

**Query Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `tenant_id` | string | Yes | - | Unique tenant identifier |
| `mode` | string | No | `"demo"` | Data source mode: `"demo"` or `"live"` |

**Example Request**:

```bash
GET /v1/onboarding/progress?tenant_id=acme-corp&mode=live
```

#### Response

**Status Code**: `200 OK`

**Response Schema**:

```typescript
interface OnboardingProgressResponse {
  tenant_id: string;
  mode: "demo" | "live";
  generated_at: string;  // ISO 8601 timestamp
  fallback_reason?: string | null;
  connectors: ConnectorProgress[];
  audits: AutomationAudit[];
}

interface ConnectorProgress {
  slug: string;  // e.g., "shopify", "meta-primary", "google-ads", "klaviyo"
  label: string;  // Human-readable name
  status: string;  // "ready" | "in_progress" | "action_needed"
  progress: number;  // 0-100
  summary?: string | null;
  action?: string | null;  // Action code to unblock (e.g., "connect_shopify")
  updated_at?: string | null;  // ISO 8601 timestamp
}

interface AutomationAudit {
  id: string;
  status: string;  // "approved" | "pending" | "shadow"
  headline: string;
  detail?: string | null;
  actor?: string | null;
  occurred_at?: string | null;  // ISO 8601 timestamp
}
```

**Example Response** (Demo Mode):

```json
{
  "tenant_id": "acme-corp",
  "mode": "demo",
  "generated_at": "2025-10-21T12:00:00Z",
  "fallback_reason": null,
  "connectors": [
    {
      "slug": "shopify",
      "label": "Shopify",
      "status": "ready",
      "progress": 100,
      "summary": "Orders synced: 1234 (geocoded 95%); Products: 456",
      "action": null,
      "updated_at": "2025-10-21T11:30:00Z"
    },
    {
      "slug": "meta-primary",
      "label": "Meta Ads",
      "status": "in_progress",
      "progress": 75,
      "summary": "Syncing campaign performance data",
      "action": "refresh_credentials",
      "updated_at": "2025-10-21T11:45:00Z"
    },
    {
      "slug": "google-ads",
      "label": "Google Ads",
      "status": "action_needed",
      "progress": 0,
      "summary": "No activity detected. Connect Google Ads to surface insights.",
      "action": "connect_google",
      "updated_at": null
    }
  ],
  "audits": [
    {
      "id": "acme-corp-audit-shadow",
      "status": "shadow",
      "headline": "Autopilot shadow mode guardrails exercised",
      "detail": "Safety overrides fired at 15% rate; guardrail violations=2.",
      "actor": "Autopilot engine",
      "occurred_at": "2025-10-21T11:00:00Z"
    }
  ]
}
```

**Example Response** (Live Mode with Fallback):

```json
{
  "tenant_id": "new-tenant",
  "mode": "live",
  "generated_at": "2025-10-21T12:00:00Z",
  "fallback_reason": "live_progress_unavailable",
  "connectors": [],
  "audits": []
}
```

#### Error Responses

**500 Internal Server Error** - Schema Validation Failed:

```json
{
  "message": "Onboarding progress contract violated",
  "schema": "onboarding_progress_response",
  "tenant_id": "acme-corp",
  "path": ["connectors", 0, "slug"],
  "reason": "Missing required field"
}
```

---

### POST /onboarding/events

Record telemetry events for onboarding analytics and audit trails. Used to track user interactions, connector events, and progress milestones.

#### Request

**Content-Type**: `application/json`

**Request Schema**:

```typescript
interface OnboardingEventRequest {
  tenant_id: string;
  name: string;  // Event name (e.g., "progress.requested", "connector.connected")
  mode?: "demo" | "live";  // Default: "demo"
  metadata?: Record<string, any>;  // Optional event metadata
  occurred_at?: string;  // ISO 8601 timestamp; defaults to server time
}
```

**Example Request**:

```bash
POST /v1/onboarding/events
Content-Type: application/json

{
  "tenant_id": "acme-corp",
  "name": "connector.connected",
  "mode": "live",
  "metadata": {
    "connector_slug": "shopify",
    "initial_sync": true,
    "orders_count": 1234
  },
  "occurred_at": "2025-10-21T12:00:00Z"
}
```

#### Response

**Status Code**: `202 Accepted`

**Response Schema**:

```typescript
interface OnboardingEventResponse {
  status: string;  // Always "recorded"
}
```

**Example Response**:

```json
{
  "status": "recorded"
}
```

---

## Data Models

### Connector Status Values

| Status | Description |
|--------|-------------|
| `ready` | Connector fully configured and syncing data |
| `in_progress` | Connector configured but data sync incomplete |
| `action_needed` | User action required (e.g., connect credentials) |

### Connector Action Codes

| Action Code | Description |
|-------------|-------------|
| `connect_shopify` | Connect Shopify credentials |
| `connect_meta` | Connect Meta Ads API credentials |
| `connect_google` | Connect Google Ads credentials |
| `connect_klaviyo` | Connect Klaviyo API credentials |
| `trigger_shopify_sync` | Trigger manual Shopify data sync |
| `trigger_klaviyo_sync` | Trigger manual Klaviyo campaign sync |
| `improve_geocoding` | Improve geocoding coverage for orders |
| `refresh_credentials` | Refresh expired API credentials |
| `refresh_weather_cache` | Refresh weather coverage validation |

### Audit Status Values

| Status | Description |
|--------|-------------|
| `approved` | Automation decision approved for production |
| `pending` | Automation decision awaiting review |
| `shadow` | Shadow mode testing (not live) |

### Event Names

Common telemetry event names:

| Event Name | Description |
|------------|-------------|
| `progress.requested` | User/system requested onboarding progress |
| `progress.loaded` | Progress snapshot successfully loaded |
| `progress.fallback` | Fallback to demo data triggered |
| `progress.error` | Error loading progress data |
| `connector.connected` | Data connector credentials added |
| `connector.synced` | Connector completed data sync |
| `connector.error` | Connector sync error |
| `audit.approved` | User approved automation audit |
| `audit.rollback` | User rolled back automation decision |
| `audit.view_evidence` | User viewed audit evidence |

---

## Use Cases

### 1. Dashboard Widget

Display real-time onboarding progress in the WeatherVane dashboard:

```typescript
import { fetchOnboardingProgress } from "@/lib/api";

async function loadOnboardingWidget(tenantId: string) {
  const progress = await fetchOnboardingProgress(tenantId, "live");

  // Display connector progress bars
  progress.connectors.forEach(connector => {
    renderProgressBar(connector.label, connector.progress, connector.status);

    if (connector.action) {
      showActionButton(connector.action);
    }
  });

  // Display recent automation audits
  progress.audits.forEach(audit => {
    renderAuditCard(audit);
  });
}
```

### 2. Onboarding Checklist

Track onboarding completion and guide users through setup:

```typescript
async function calculateOnboardingCompletion(tenantId: string) {
  const progress = await fetchOnboardingProgress(tenantId, "live");

  const totalConnectors = progress.connectors.length;
  const readyConnectors = progress.connectors.filter(c => c.status === "ready").length;
  const completionRate = (readyConnectors / totalConnectors) * 100;

  return {
    completionRate,
    nextSteps: progress.connectors
      .filter(c => c.action)
      .map(c => ({ connector: c.label, action: c.action }))
  };
}
```

### 3. Telemetry Tracking

Record user interactions for analytics:

```typescript
import { recordOnboardingEvent } from "@/lib/api";

// Track when user clicks "Connect Shopify"
async function handleConnectShopify(tenantId: string) {
  await recordOnboardingEvent(
    tenantId,
    "connector.connect_initiated",
    "live",
    { connector_slug: "shopify" }
  );

  // ... trigger Shopify OAuth flow
}

// Track successful sync completion
async function handleSyncComplete(tenantId: string, orderCount: number) {
  await recordOnboardingEvent(
    tenantId,
    "connector.synced",
    "live",
    {
      connector_slug: "shopify",
      orders_synced: orderCount,
      initial_sync: true
    }
  );
}
```

### 4. Fallback Handling

Gracefully handle live data unavailability:

```typescript
async function loadProgressWithFallback(tenantId: string) {
  const progress = await fetchOnboardingProgress(tenantId, "live");

  if (progress.fallback_reason) {
    console.warn(`Fallback triggered: ${progress.fallback_reason}`);

    // Record fallback event
    await recordOnboardingEvent(
      tenantId,
      "progress.fallback",
      "live",
      {
        fallback_reason: progress.fallback_reason,
        connectors: progress.connectors.length,
        audits: progress.audits.length
      }
    );

    // Show user-friendly message
    showNotification("Loading demo data while live data syncs...");
  }

  return progress;
}
```

---

## Frontend Integration

### React Hook Example

The `useOnboardingProgress` hook provides automatic progress tracking:

```typescript
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";

function OnboardingDashboard({ tenantId }: { tenantId: string }) {
  const {
    connectors,
    audits,
    loading,
    error,
    mode,
    isFallback,
    fallbackReason
  } = useOnboardingProgress({ tenantId, mode: "live" });

  if (loading) return <Spinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <div>
      {isFallback && (
        <Alert>Showing demo data: {fallbackReason}</Alert>
      )}

      <ConnectorList connectors={connectors} />
      <AuditTimeline audits={audits} />
    </div>
  );
}
```

---

## Performance & Caching

- **Response Time**: Typically < 100ms for demo mode, < 500ms for live mode
- **Rate Limiting**: No enforced limits (internal API)
- **Caching**: Frontend should cache progress for ~30 seconds to reduce server load
- **Polling**: Recommended polling interval: 30-60 seconds for dashboard widgets

---

## Testing

### Test Coverage

- **API Routes**: 18 comprehensive tests
- **Telemetry Service**: 20 unit tests
- **Contract Validation**: 1 schema validation test
- **Total**: 39 tests, 100% passing

### Running Tests

```bash
# Run all onboarding API tests
pytest tests/api/test_onboarding_routes.py -v

# Run telemetry tests
pytest tests/shared/services/test_onboarding_telemetry.py -v

# Run contract validation tests
pytest tests/test_onboarding_contracts.py -v

# Run all onboarding tests
pytest tests/test_onboarding_contracts.py \
       tests/api/test_onboarding_routes.py \
       tests/shared/services/test_onboarding_telemetry.py -v
```

---

## Implementation Details

### Backend Stack

- **Framework**: FastAPI
- **Validation**: Pydantic + JSONSchema
- **Data Store**: JsonStateStore (file-based state management)
- **Telemetry**: `shared.observability.metrics`

### File Locations

- **Routes**: `apps/api/routes/onboarding.py`
- **Schemas**: `apps/api/schemas/onboarding.py`
- **Service**: `shared/services/onboarding/progress.py`
- **Telemetry**: `shared/services/onboarding/telemetry.py`
- **Models**: `shared/services/onboarding/models.py`
- **Tests**: `tests/api/test_onboarding_routes.py`, `tests/shared/services/test_onboarding_telemetry.py`

### Telemetry Implementation

Events are emitted via `metrics.emit()` with the following structure:

```python
metrics.emit(
    "onboarding.event",
    {
        "tenant_id": event.tenant_id,
        "name": event.name,
        "metadata": dict(event.metadata),
        "occurred_at": event.occurred_at.isoformat(),
    },
    tags={"mode": event.mode.value}
)
```

---

## Migration Guide

### From localStorage to API

If migrating from client-side storage:

**Before**:
```typescript
const progress = JSON.parse(localStorage.getItem('onboarding_progress') || '{}');
```

**After**:
```typescript
import { fetchOnboardingProgress } from '@/lib/api';
const progress = await fetchOnboardingProgress(tenantId, 'live');
```

### Event Tracking Migration

**Before**:
```typescript
console.log('User connected Shopify');
```

**After**:
```typescript
import { recordOnboardingEvent } from '@/lib/api';
await recordOnboardingEvent(
  tenantId,
  'connector.connected',
  'live',
  { connector_slug: 'shopify' }
);
```

---

## Changelog

### Version 1.0 (October 21, 2025)

- ✅ Implemented GET /onboarding/progress endpoint
- ✅ Implemented POST /onboarding/events endpoint
- ✅ Added comprehensive test suite (39 tests)
- ✅ Integrated telemetry instrumentation
- ✅ Added schema validation with JSONSchema
- ✅ Implemented fallback to demo data for new tenants
- ✅ Created API documentation

---

## Support

For questions or issues:

- **Documentation**: See `docs/ONBOARDING.md` for product context
- **API Issues**: Check `tests/api/test_onboarding_routes.py` for examples
- **Frontend Integration**: Review `apps/web/src/hooks/useOnboardingProgress.ts`
