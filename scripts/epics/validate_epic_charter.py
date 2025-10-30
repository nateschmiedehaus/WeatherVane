#!/usr/bin/env python3
"""
Validate Epic Charter (lightweight)

Checks minimal required fields in state/epics/<EPIC-ID>/charter.yaml.
Outputs a small JSON report to stdout and exits non-zero on failure.
"""
import argparse, json, sys
from pathlib import Path
try:
    import yaml  # type: ignore
except Exception:
    yaml = None

REQUIRED_FIELDS = [
    "epic_id", "level", "title", "why_now", "kpis", "kill_triggers", "related", "risk_class"
]
ALLOWED_LEVELS = {"task_group", "epic", "super_epic"}

def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("workspace_root", type=str)
    p.add_argument("--epic", required=True)
    args = p.parse_args()

    root = Path(args.workspace_root).resolve()
    charter = root / "state" / "epics" / args.epic / "charter.yaml"
    report = {"epic_id": args.epic, "charter_path": str(charter), "errors": []}

    if yaml is None:
        report["errors"].append("pyyaml not installed")
        print(json.dumps(report, indent=2))
        return 2

    if not charter.exists():
        report["errors"].append("charter.yaml not found")
        print(json.dumps(report, indent=2))
        return 1

    try:
        data = yaml.safe_load(charter.read_text()) or {}
    except Exception as e:
        report["errors"].append(f"YAML parse error: {e}")
        print(json.dumps(report, indent=2))
        return 1

    for f in REQUIRED_FIELDS:
        if f not in data or data.get(f) in (None, "", []):
            report["errors"].append(f"missing field: {f}")
    # level validity
    lvl = data.get("level")
    if lvl and lvl not in ALLOWED_LEVELS:
        report["errors"].append(f"invalid level: {lvl}")
    # parent/children shape checks (lightweight)
    if data.get("parent_id") and data.get("parent_id") == data.get("epic_id"):
        report["errors"].append("parent_id cannot equal epic_id")

    ok = len(report["errors"]) == 0
    report["ok"] = ok
    print(json.dumps(report, indent=2))
    return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main())
