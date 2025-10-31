# SPEC — FIX-META-TEST-GAMING-INTEGRATION

- Invoke `detect_test_gaming.sh` automatically during VERIFY→REVIEW transitions.
- Do not block in observe mode; emit warnings and continue.
- Log results to `state/analytics/gaming_detections.jsonl` with task metadata and pattern details.
- Capture script failures and proceed with warnings (fail-safe).
- Add unit tests covering success, failure, and timeout paths.
