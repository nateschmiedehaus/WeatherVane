# THINK — Edge Cases

- Script missing or not executable → treat as warning, log error, continue.
- Script outputs malformed JSON → capture stderr, surface warning message, avoid crash.
- Long-running script (> timeout) → send SIGTERM then SIGKILL, log timeout warning.
- Multiple patterns detected → include counts + first N samples in telemetry to avoid huge payloads.
