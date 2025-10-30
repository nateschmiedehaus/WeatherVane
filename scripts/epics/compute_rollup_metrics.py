#!/usr/bin/env python3
"""
Compute rollup metrics for a super_epic from child groups.

Reads state/epics/<SUPER-ID>/charter.yaml for children and rollup KPIs,
then aggregates child metrics from state/evidence/<child>/monitor/canary_judge.json.

Outputs state/evidence/<SUPER-ID>/monitor/rollup_metrics.json with { ok, kpis: [...] }.
Exits non-zero on hard errors; ok=false if incomplete.
"""
import argparse, json, sys
from pathlib import Path
try:
    import yaml  # type: ignore
except Exception:
    yaml = None

AGG_FUNCS = {
    "mean": lambda vals: sum(vals) / len(vals) if vals else None,
    "min": lambda vals: min(vals) if vals else None,
    "max": lambda vals: max(vals) if vals else None,
    "and": lambda vals: int(all(bool(v) for v in vals)) if vals else None,
    "or": lambda vals: int(any(bool(v) for v in vals)) if vals else None,
}

def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("workspace_root", type=str)
    p.add_argument("--super", dest="super_id", required=True)
    args = p.parse_args()

    root = Path(args.workspace_root).resolve()
    charter = root / "state" / "epics" / args.super_id / "charter.yaml"
    outdir = root / "state" / "evidence" / args.super_id / "monitor"
    outdir.mkdir(parents=True, exist_ok=True)
    out = outdir / "rollup_metrics.json"

    report = {"super_id": args.super_id, "ok": False, "kpis": [], "errors": []}

    if yaml is None:
        report["errors"].append("pyyaml not installed")
        out.write_text(json.dumps(report, indent=2))
        print(out)
        return 2

    if not charter.exists():
        report["errors"].append("charter.yaml not found")
        out.write_text(json.dumps(report, indent=2))
        print(out)
        return 1

    try:
        data = yaml.safe_load(charter.read_text()) or {}
    except Exception as e:
        report["errors"].append(f"YAML parse error: {e}")
        out.write_text(json.dumps(report, indent=2))
        print(out)
        return 1

    level = data.get("level")
    if level != "super_epic":
        report["errors"].append(f"expected super_epic level, got {level}")
        out.write_text(json.dumps(report, indent=2))
        print(out)
        return 1

    children = data.get("children") or []
    rollup = (data.get("rollup") or {}).get("kpis") or []
    if not children or not rollup:
        report["errors"].append("missing children or rollup.kpis")
        out.write_text(json.dumps(report, indent=2))
        print(out)
        return 1

    all_ok = True
    for k in rollup:
        name = k.get("name")
        agg = k.get("aggregator", "mean")
        if name is None or agg not in AGG_FUNCS:
            report["errors"].append(f"invalid kpi spec: {k}")
            all_ok = False
            continue
        vals = []
        for child in children:
            cj = root / "state" / "evidence" / child / "monitor" / "canary_judge.json"
            if not cj.exists():
                continue
            try:
                cj_data = json.loads(cj.read_text())
                metrics = cj_data.get("metrics") or {}
                if name in metrics and isinstance(metrics[name], (int, float)):
                    vals.append(float(metrics[name]))
            except Exception:
                continue
        agg_val = AGG_FUNCS[agg](vals)
        report["kpis"].append({"name": name, "aggregator": agg, "values": vals, "value": agg_val})
        if agg_val is None:
            all_ok = False

    report["ok"] = all_ok and not report["errors"]
    out.write_text(json.dumps(report, indent=2))
    print(out)
    return 0 if report["ok"] else 1

if __name__ == "__main__":
    sys.exit(main())

