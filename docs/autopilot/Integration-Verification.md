
# Integration‑First & Programmatic Verification

## Protocol: Search → Integrate → Verify

**Search (5–10 min)**  
Terms: `registry`, `discovery`, `model`, `queue`, `scheduler`, `worker`, `job`, `cache`, `auth`, `config`, `logger`  
Commands:
```bash
grep -R "registry\|discovery\|model" src/
rg "queue|scheduler|worker|job" src/
```

**Integrate (not duplicate)**  
Use/extend shared utilities; align with interfaces; never hardcode values that belong to registries.

**Verify (programmatic)**  
Script + tests must prove: called, propagated, **used**, shared utils imported, no duplicate types, logs attribute source, negative‑path exists.

## Red Flags
Hardcoded values; duplicate interfaces; bypassed shared logger/config/cache; inconsistent patterns.

## Example: ComplexityRouter
Fix: query ModelRegistry/Discovery → pass through runners → agents use `modelSelection ?? fallback`.

## 8‑Check Script Template
See `docs/autopilot/examples/verify_system_integration.sh`.
