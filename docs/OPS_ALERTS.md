# Operations Alerts - WeatherVane

**Purpose**: Automatic escalation of blockers with fix instructions

**Status**: Active monitoring

---

## Active Blockers

*No active blockers as of 2025-10-22*

---

## How This Works

When any verification check fails (pre-check, post-check, critic, artifact), the system automatically:

1. **Logs telemetry** to `state/telemetry/task_verification.jsonl`
2. **Updates this file** with blocker details
3. **Provides fix commands** that can be copy-pasted
4. **Blocks task completion** until resolved

---

## Blocker Template

When a blocker is detected, it's added here with this format:

```markdown
### [BLOCKER-YYYYMMDD-NNN] Title

**Detected**: 2025-10-22 14:30 UTC
**Severity**: CRITICAL | HIGH | MEDIUM
**Task(s) Affected**: T12.3.1, T13.5.2
**Status**: OPEN | INVESTIGATING | RESOLVED

**Symptom**:
Description of what's failing

**Root Cause** (if known):
What's causing the issue

**Fix Instructions**:
```bash
# Commands to run to fix the issue
command1
command2
```

**Verification**:
```bash
# Command to verify fix worked
verification_command
```

**Owner**: Atlas | Dana | Claude
**Last Updated**: 2025-10-22 14:30 UTC
```

---

## Recent Resolutions

### [RESOLVED-20251022-001] Shapely Segfault

**Detected**: 2025-10-22 10:00 UTC
**Resolved**: 2025-10-22 13:00 UTC
**Duration**: 3 hours

**Issue**: Shapely imports causing segmentation fault
**Fix**: Health check module created to catch gracefully
**Prevention**: Pre-task ModelingDataWatch critic now checks before scheduling

---

## Monitoring Status

| Component | Status | Last Check | Next Check |
|-----------|--------|------------|------------|
| Python Environment | ✅ HEALTHY | 2025-10-22 14:30 | Real-time |
| Shapely/GEOS | ✅ HEALTHY | 2025-10-22 14:30 | Pre-task |
| Required Packages | ✅ HEALTHY | 2025-10-22 14:30 | Pre-task |
| Synthetic Data | ⚠️ PARTIAL (4/20 tenants) | 2025-10-22 14:30 | Pre-task |
| Disk Space | ✅ HEALTHY | 2025-10-22 14:30 | Hourly |

---

## Escalation Paths

1. **Immediate** (< 1 hour): Atlas investigates and applies fix
2. **Same day** (< 8 hours): Dana reviews if systemic issue
3. **Next day** (< 24 hours): Claude reviews policy/process changes
4. **External**: If can't resolve internally, escalate to package maintainers or infra team

---

## Blocker History

View full history in: `state/telemetry/task_verification.jsonl`

Query recent failures:
```bash
cat state/telemetry/task_verification.jsonl | jq 'select(.passed == false)' | tail -10
```

---

*This file is automatically updated by the verification system*
*Manual edits will be preserved in the "Manual Notes" section below*

## Manual Notes

(Add any manual observations or context here)
