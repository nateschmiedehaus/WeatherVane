# Geo Holdout Incrementality Integration

**Status**: ✅ IMPLEMENTED & TESTED (17 tests passing)

## Overview

This document describes the integration of geo holdout experiment management into the ingestion pipeline. The incrementality module measures weather impact on customer behavior by running geo-based holdout experiments.

## Architecture

### Data Flow

```
Ingestion Pipeline
    ↓
Ingest Orders (Shopify API)
    ↓
Run Incrementality Step (NEW)
    ├─ Read orders from lake
    ├─ Design geo holdout (treatment/control split)
    ├─ Persist assignment
    └─ Log telemetry
    ↓
Return pipeline results (includes incrementality data)
```

### Key Components

1. **Incrementality Module** (`apps/validation/incrementality.py`)
   - `design_holdout_from_orders()`: Design holdout experiment from order data
   - `compute_holdout_summary()`: Analyze experimental lift
   - `estimate_to_payload()`: Serialize results for persistence

2. **Integration Module** (`apps/worker/flows/incrementality_step.py`) - NEW
   - `run_incrementality_step()`: Main async entry point
   - `compute_geo_holdout()`: Wrapper around validation logic
   - `persist_holdout_assignment()`: Save assignments to disk
   - `log_experiment_event()`: Append telemetry events

3. **Pipeline Integration** (`apps/worker/flows/ingestion_pipeline.py`)
   - Added `run_incrementality_step()` call after Shopify ingestion
   - Passes results through main pipeline output

## Usage

### In Ingestion Pipeline

The incrementality step runs automatically after each Shopify ingestion:

```python
# Within orchestrate_ingestion_flow()
incrementality_result = await run_incrementality_step(
    tenant_id,
    resolved_lake_root,
    base_dir=Path.cwd(),
)
```

The result is included in the pipeline return payload with key `"incrementality"`.

### Direct Usage

```python
from apps.worker.flows.incrementality_step import run_incrementality_step

result = await run_incrementality_step(
    tenant_id="tenant-123",
    lake_root="storage/lake/raw",
    base_dir=Path.cwd(),
    holdout_ratio=0.2,  # 20% of geos as control
    min_holdout_units=4,  # minimum 4 geos in control
)

if result["status"] == "success":
    assignment_path = result["assignment_path"]
    design = result["design"]
```

## Output Paths

### Assignments (Persistent)

Holdout assignments are persisted as JSON under:

```
state/analytics/experiments/geo_holdouts/
├── tenant-1_20251021_210000.json
├── tenant-1_20251021_220000.json
└── ...
```

Each file contains:

```json
{
  "tenant_id": "tenant-1",
  "generated_at": "2025-10-21T21:00:00.123456",
  "status": "ready",
  "geo_count": 15,
  "holdout_count": 3,
  "control_share": 0.25,
  "geo_column": "ship_geohash",
  "assignment": [
    {"geo": "9q8yy", "group": "treatment", "weight": 0.08},
    {"geo": "9q9zz", "group": "control", "weight": 0.04},
    ...
  ]
}
```

### Telemetry (Streaming)

Experiment events are logged to:

```
state/telemetry/experiments/geo_holdout_runs.jsonl
```

Each line is a JSON event:

```json
{
  "tenant_id": "tenant-1",
  "timestamp": "2025-10-21T21:00:00.123456",
  "event": "holdout_assigned",
  "geo_count": 15,
  "holdout_count": 3,
  "control_share": 0.25,
  "assignment_path": "state/analytics/experiments/geo_holdouts/tenant-1_20251021_210000.json"
}
```

## Return Statuses

### Success (`status: "success"`)

Holdout design completed successfully. Fields:

- `status`: `"success"`
- `design`: Full design dict with assignment array
- `assignment_path`: Path to persisted JSON file
- `tenant_id`: The tenant identifier

### Skip (`status: "skip"`)

Holdout was skipped due to data issues. Reasons include:

- `"no_orders"`: No order data found for tenant
- `"insufficient_geo"`: Too few geos (threshold: `max(min_holdout_units * 2, 4)`)

### Error (`status: "error"`)

An error occurred during processing. Fields:

- `status`: `"error"`
- `reason`: Error message
- `tenant_id`: The tenant identifier

## Configuration

The incrementality step accepts these parameters:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `tenant_id` | str | required | Tenant identifier |
| `lake_root` | str | required | Root path to data lake |
| `base_dir` | Path | required | Base directory for outputs |
| `holdout_ratio` | float | 0.2 | Fraction of geos in control |
| `min_holdout_units` | int | 4 | Minimum geos in control |

## Integration Points

### Data Sources

- **Orders**: Read from lake at `{tenant_id}_shopify_orders` after ingestion
- **Revenue**: Derived from order data (net_revenue or subtotal - discounts)

### Downstream Consumers

- **Experiment Analysis**: Use assignments to split order data for lift calculation
- **Reporting**: Display experiment status in dashboard/API
- **Modeling**: Incorporate holdout indicator in MMM features

## Testing

Run the test suite:

```bash
# All tests
pytest tests/test_incrementality_integration.py -v

# Specific test class
pytest tests/test_incrementality_integration.py::TestComputeGeoHoldout -v

# Coverage
pytest tests/test_incrementality_integration.py --cov=apps.worker.flows.incrementality_step
```

**Test Coverage** (17 tests):

1. **Holdout Computation** (5 tests)
   - Successful design creation
   - Insufficient geo handling
   - Seed reproducibility
   - Geo coverage
   - Treatment/control split

2. **Persistence** (3 tests)
   - Directory creation
   - Valid JSON output
   - Tenant ID encoding

3. **Telemetry** (3 tests)
   - File creation
   - JSONL append
   - Timestamp inclusion

4. **Full Step Execution** (4 tests)
   - Successful execution
   - No-orders handling
   - Telemetry logging
   - Assignment persistence

5. **Pipeline Integration** (2 tests)
   - Module imports
   - Result payload structure

## Example Workflow

### Phase 0: Design Experiment

After ingestion, the pipeline automatically designs holdout experiments:

```python
# In orchestrate_ingestion_flow()
incrementality_result = await run_incrementality_step(
    tenant_id="my-brand",
    lake_root=resolved_lake_root,
    base_dir=Path.cwd(),
)

# Check result
if incrementality_result["status"] == "success":
    assignment_path = incrementality_result["assignment_path"]
    geo_count = incrementality_result["design"]["geo_count"]
    print(f"Designed holdout: {geo_count} geos, assignment at {assignment_path}")
```

### Phase 1: Analyze Lift

Later, when analyzing experimental lift:

```python
# Load assignment
import json
assignment_data = json.loads(Path(assignment_path).read_text())

# Use assignment to split orders
from apps.validation.incrementality import compute_holdout_summary

# Aggregate orders by geo and group
aggregated = orders.group_by(["ship_geohash", "group"]).agg(...)

# Compute lift
lift_estimate = compute_holdout_summary(
    aggregated,
    assignment_data["assignment"],
    geo_column="ship_geohash",
    value_column="revenue",
)

print(f"Lift: {lift_estimate.lift:.1%} (p={lift_estimate.p_value:.3f})")
```

## Key Design Decisions

1. **Reproducible Seeding**: Fixed seed (42) ensures reproducible assignments across runs
2. **Revenue-Weighted Sampling**: Geos are selected proportional to historical revenue
3. **Minimum Geo Thresholds**: Ensures statistical power (`min(geo_count, max(min_holdout_units * 2, 4))`)
4. **Persistent JSON**: Assignments stored as JSON for portability and audit trail
5. **Streaming Telemetry**: Events logged to JSONL for real-time monitoring

## Metrics & Telemetry

The incrementality step tracks:

| Metric | Path | Format |
|--------|------|--------|
| Holdout assignments | `state/analytics/experiments/geo_holdouts/*.json` | JSON |
| Experiment events | `state/telemetry/experiments/geo_holdout_runs.jsonl` | JSONL |
| Pipeline results | Returned from `orchestrate_ingestion_flow()` | Python dict |

## Guardrails & Safety

1. **No-Op on Missing Data**: Skips gracefully if no orders found
2. **Minimum Sample Size**: Rejects designs with insufficient geos
3. **Error Handling**: Logs and reports errors without breaking pipeline
4. **Idempotent**: Can re-run for same tenant without side effects
5. **Audit Trail**: All decisions persisted and logged

## Related Documentation

- [Incrementality Validation Module](apps/validation/incrementality.py)
- [Phase 0 Execution Plan](docs/product/PHASE0_PHASE1_EXECUTION_PLAN.md)
- [Ingestion Pipeline](apps/worker/flows/ingestion_pipeline.py)

## Future Enhancements

1. **Dynamic Seeding**: Allow seed override per tenant
2. **Confidence Intervals**: Return confidence bounds on assignments
3. **Experimentation Dashboard**: Real-time experiment status UI
4. **A/B Test Scheduling**: Schedule experiments in advance
5. **Multi-Geo Holdouts**: Cross-geo experiment designs

---

**Last Updated**: 2025-10-21
**Implementation**: ✅ Complete
**Testing**: ✅ 17/17 passing
**Documentation**: ✅ Complete
