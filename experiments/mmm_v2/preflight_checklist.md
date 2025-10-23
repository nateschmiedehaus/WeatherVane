# Preflight Checklist — MMM v2 Validation

- [x] `bash tools/wvo_mcp/scripts/run_integrity_tests.sh` *(evidence: integrity suite executed prior to packaging — see CI logs 2025-10-22)*
- [ ] `make lint`
- [ ] Data snapshot recorded (`data/snapshots/<yyyymmdd>`) *(pending; synthetic data rerun required)*
- [ ] Feature store sync verified (`make worker` warmup) *(not executed in this cycle)*
- [x] Dependencies locked (no changes to `poetry.lock` / `package-lock.json` during documentation work)

> NOTE: Checklist reflects state at the time of packaging. Outstanding boxes must be completed in conjunction with remediation tasks before requesting production sign-off.

