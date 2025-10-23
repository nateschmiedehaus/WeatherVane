#!/usr/bin/env python3
"""
Autopilot Policy Controller

Implements a lightweight reinforcement-learning (RL) policy for WeatherVane's
autopilot loop. The controller watches roadmap state, balance telemetry, and
prior cycle outcomes to steer Atlas without human intervention.

Workflow:
  * `decide`  – analyse the roadmap graph and current telemetry, then emit a
                domain/action recommendation plus prompt directives.
  * `update`  – ingest the latest autopilot summary and adjust Q-values,
                per-task adjustments, and exploration parameters.

All policy state is persisted under `state/policy/autopilot_policy.json` so the
agent learns across runs. Decision/update events are logged to
`state/analytics/autopilot_policy_history.jsonl` for auditing.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import re
import sqlite3
import sys
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple, Set

import yaml


FORCE_PRODUCT = os.getenv("WVO_AUTOPILOT_FORCE_PRODUCT", "1") != "0"
ALLOW_MCP = os.getenv("WVO_AUTOPILOT_ALLOW_MCP", "0") == "1"


DEFAULT_CRITIC_GROUP = "general"
CRITIC_CLASS_MAP: Dict[str, Set[str]] = {
    "design": {
        "design_system",
        "responsive_surface",
        "weather_aesthetic",
        "motion_design",
        "experience_flow",
        "stakeholder_narrative",
        "demo_conversion",
        "inspiration_coverage",
    },
    "allocator": {
        "allocator",
        "prompt_budget",
        "cost_perf",
        "spend_guardrails",
    },
    "quality": {
        "tests",
        "build",
        "health_check",
        "integration_fury",
        "network_navigator",
        "data_quality",
        "org_pm",
        "human_sync",
    },
    "security": {
        "security",
        "auth",
        "compliance",
    },
    "infrastructure": {
        "upgrade_preflight",
        "upgrade",
        "live_flags",
        "sandbox_pool",
        "telemetry",
        "worker_health",
        "failover",
    },
    "creative": {
        "exec_review",
        "creative_guardrails",
        "brand",
    },
}


def critic_group(name: str) -> str:
    """Map a critic name to its broader class for resilience to renames."""
    if not isinstance(name, str):
        return DEFAULT_CRITIC_GROUP
    normalized = name.strip().lower()
    base = normalized.replace("critic:", "")
    for group, members in CRITIC_CLASS_MAP.items():
        if base in members:
            return group
    if base.endswith("_critic"):
        trimmed = base[: -len("_critic")]
        for group, members in CRITIC_CLASS_MAP.items():
            if trimmed in members:
                return group
    for group, members in CRITIC_CLASS_MAP.items():
        for member in members:
            if base.startswith(member) or member in base:
                return group
    return DEFAULT_CRITIC_GROUP


TASK_CLASS_RULES = [
    {"name": "product_design", "domains": {"product"}, "critic_groups": {"design"}},
    {"name": "product_allocator", "domains": {"product"}, "critic_groups": {"allocator"}},
    {"name": "product_quality", "domains": {"product"}, "critic_groups": {"quality"}},
    {"name": "product_creative", "domains": {"product"}, "critic_groups": {"creative"}},
    {"name": "mcp_infrastructure", "domains": {"mcp"}, "critic_groups": {"infrastructure"}},
    {"name": "mcp_quality", "domains": {"mcp"}, "critic_groups": {"quality"}},
]


def classify_task_group(domain: str, critic_groups: Iterable[str], task_id: str) -> str:
    """Assign tasks to broader groups based on critic clusters and domain."""
    critic_set = {critic_group(item) if isinstance(item, str) else DEFAULT_CRITIC_GROUP for item in critic_groups}
    domain_lower = (domain or "").strip().lower()
    for rule in TASK_CLASS_RULES:
        if domain_lower in rule["domains"] and critic_set & rule["critic_groups"]:
            return rule["name"]
    if domain_lower == "product":
        return "product_core"
    if domain_lower == "mcp":
        if task_id.lower().startswith("t6.4"):
            return "mcp_upgrade_lane"
        return "mcp_core"
    return f"{domain_lower or 'unknown'}_core"


DEFAULT_STATE = Path("state/policy/autopilot_policy.json")
DEFAULT_HISTORY = Path("state/analytics/autopilot_policy_history.jsonl")
DEFAULT_BALANCE = Path("state/autopilot_balance.json")
DEFAULT_ROADMAP = Path("state/roadmap.yaml")
CRITICS_BACKOFF_PATH = Path("state/autopilot_critics_backoff.json")

MCP_INFRASTRUCTURE_PHASES = [
    "PHASE-1-HARDENING",
    "PHASE-2-COMPACT",
    "PHASE-3-BATCH",
    "PHASE-4-POLISH",
    "PHASE-5-OPTIMIZATION",
]

TASK_ID_PATTERN = re.compile(r"(T\d+(?:\.\d+)*|E\d+)")


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return default


def dump_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def load_yaml(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError:
        return {}


def parse_metadata_blob(blob: Optional[str]) -> Dict[str, Any]:
    if not blob:
        return {}
    try:
        data = json.loads(blob)
    except json.JSONDecodeError:
        return {}
    if isinstance(data, dict):
        return data
    return {}


def aggregate_status(statuses: Iterable[str]) -> str:
    normalised = [normalise_status(status) for status in statuses if isinstance(status, str)]
    if not normalised:
        return "pending"
    if any(status in {"blocked", "needs_improvement"} for status in normalised):
        return "blocked"
    if any(status in {"in_progress", "needs_review"} for status in normalised):
        return "in_progress"
    if any(status == "pending" for status in normalised):
        return "pending"
    if all(status == "done" for status in normalised):
        return "done"
    return normalised[0]


def build_roadmap_from_db(db_path: Path) -> Dict[str, Any]:
    if not db_path.exists():
        return {"epics": []}

    try:
        connection = sqlite3.connect(str(db_path))
        connection.row_factory = sqlite3.Row
    except sqlite3.Error:
        return {"epics": []}

    try:
        rows = connection.execute(
            "SELECT id, title, status, metadata, description FROM tasks"
        ).fetchall()
        if not rows:
            return {"epics": []}

        def summarise_product_state(records: Iterable[sqlite3.Row]) -> Tuple[bool, List[str]]:
            has_active = False
            blocked_meta_ids: List[str] = []
            for record in records:
                metadata = parse_metadata_blob(record["metadata"])
                domain = (metadata.get("domain") or "").strip().lower()
                if not domain:
                    epic_id = str(metadata.get("epic_id") or "").upper()
                    if epic_id.startswith("E6"):
                        domain = "mcp"
                    elif epic_id.startswith("E"):
                        domain = "product"
                if domain != "product":
                    continue
                status = normalise_status(record["status"])
                if status in {"pending", "in_progress", "needs_review", "needs_improvement"}:
                    has_active = True
                elif status == "blocked":
                    blocking_phases = metadata.get("blocking_phases")
                    if isinstance(blocking_phases, list):
                        if any((str(phase) or "").upper() in MCP_INFRASTRUCTURE_PHASES for phase in blocking_phases):
                            blocked_meta_ids.append(str(record["id"]))
                            continue
                    if metadata.get("blocked_by_meta_work") is True:
                        blocked_meta_ids.append(str(record["id"]))
            return has_active, blocked_meta_ids

        has_active_product, meta_blocked_ids = summarise_product_state(rows)

        if not has_active_product and meta_blocked_ids:
            try:
                connection.execute("BEGIN")
                for task_id in meta_blocked_ids:
                    connection.execute(
                        """
                        UPDATE tasks
                        SET status='pending',
                            metadata = json_remove(
                                json_remove(
                                    json_remove(coalesce(metadata, '{}'), '$.blocked_by_meta_work'),
                                    '$.blocking_phases'
                                ),
                                '$.meta_focus_enforced_at'
                            )
                        WHERE id = ?
                        """,
                        (task_id,),
                    )
                connection.commit()
                rows = connection.execute(
                    "SELECT id, title, status, metadata, description FROM tasks"
                ).fetchall()
            except sqlite3.Error:
                connection.rollback()

        dependency_rows = connection.execute(
            "SELECT task_id, depends_on_task_id FROM task_dependencies"
        ).fetchall()
    except sqlite3.Error:
        return {"epics": []}
    finally:
        connection.close()

    dependencies: Dict[str, List[str]] = defaultdict(list)
    for record in dependency_rows:
        task_id = record["task_id"]
        depends_on = record["depends_on_task_id"]
        if task_id and depends_on:
            dependencies[str(task_id)].append(str(depends_on))

    epics: Dict[str, Dict[str, Any]] = {}
    epic_status_override: Dict[str, str] = {}
    epic_statuses: Dict[str, List[str]] = defaultdict(list)
    epic_domains: Dict[str, List[str]] = defaultdict(list)
    milestone_statuses: Dict[Tuple[str, str], List[str]] = defaultdict(list)

    def ensure_epic(epic_id: str, title_hint: Optional[str], domain_hint: Optional[str], description: Optional[str]) -> Dict[str, Any]:
        identifier = epic_id or "E-GENERAL"
        entry = epics.get(identifier)
        if not entry:
            entry = {
                "id": identifier,
                "title": title_hint or identifier,
                "status": "pending",
                "domain": (domain_hint or "product").lower(),
                "milestones": {},
            }
            if description:
                entry["description"] = description
            epics[identifier] = entry
        else:
            if title_hint and (entry.get("title") in (identifier, "", None)):
                entry["title"] = title_hint
            if domain_hint:
                preferred = domain_hint.lower()
                current = (entry.get("domain") or "product").lower()
                if current == "product" and preferred != "product":
                    entry["domain"] = preferred
            if description and not entry.get("description"):
                entry["description"] = description
        if domain_hint:
            epic_domains[identifier].append(str(domain_hint).lower())
        return entry

    def ensure_milestone(epic_entry: Dict[str, Any], milestone_id: Optional[str], title_hint: Optional[str]) -> Dict[str, Any]:
        base_id = milestone_id or f"{epic_entry['id']}-backlog"
        base_title = title_hint or ("Backlog" if milestone_id is None else base_id)
        milestones: Dict[str, Dict[str, Any]] = epic_entry["milestones"]
        entry = milestones.get(base_id)
        if not entry:
            entry = {
                "id": base_id,
                "title": base_title,
                "status": "pending",
                "tasks": [],
            }
            milestones[base_id] = entry
        else:
            if title_hint and (entry.get("title") in (base_id, "", None, "Backlog")):
                entry["title"] = title_hint
        return entry

    # First pass: prime epic overrides for dedicated epic rows.
    for row in rows:
        row_id = str(row["id"])
        metadata = parse_metadata_blob(row["metadata"])
        is_epic_root = metadata.get("kind") == "epic" or re.match(r"^E\d+", row_id, re.IGNORECASE)
        if is_epic_root and not metadata.get("epic_id"):
            status = normalise_status(row["status"])
            epic_entry = ensure_epic(
                row_id,
                metadata.get("epic_title") or row["title"],
                metadata.get("domain"),
                metadata.get("description") or row["description"],
            )
            epic_status_override[row_id] = status
            continue

    # Second pass: materialise tasks into milestones.
    for row in rows:
        row_id = str(row["id"])
        metadata = parse_metadata_blob(row["metadata"])
        is_epic_root = metadata.get("kind") == "epic" or re.match(r"^E\d+", row_id, re.IGNORECASE)
        # Skip epic nodes already handled unless explicitly attributed to another epic.
        if is_epic_root and not metadata.get("epic_id"):
            continue

        status = normalise_status(row["status"])
        title = (row["title"] or metadata.get("title") or row_id).strip()
        description = (row["description"] or metadata.get("description")) or None
        epic_id = metadata.get("epic_id")
        milestone_id = metadata.get("milestone_id")
        milestone_title = metadata.get("milestone_title")
        domain_hint = metadata.get("domain") or "product"

        epic_entry = ensure_epic(
            str(epic_id or "E-GENERAL"),
            metadata.get("epic_title"),
            domain_hint,
            metadata.get("epic_description"),
        )
        milestone_entry = ensure_milestone(epic_entry, milestone_id, milestone_title)

        exit_criteria_raw = metadata.get("exit_criteria") or []
        if isinstance(exit_criteria_raw, (list, tuple)):
            exit_criteria = [str(item) for item in exit_criteria_raw if item]
        else:
            exit_criteria = []

        dependency_list = sorted({str(dep) for dep in dependencies.get(row_id, [])})

        task_payload: Dict[str, Any] = {
            "id": row_id,
            "title": title,
            "status": status,
            "dependencies": dependency_list,
            "exit_criteria": exit_criteria,
            "domain": str(domain_hint).lower(),
        }
        if description:
            task_payload["description"] = description

        milestone_entry["tasks"].append(task_payload)
        epic_statuses[epic_entry["id"]].append(status)
        milestone_statuses[(epic_entry["id"], milestone_entry["id"])].append(status)

    # Finalise milestone and epic statuses plus domain normalisation.
    document_epics: List[Dict[str, Any]] = []
    for epic_id, epic_entry in sorted(epics.items()):
        # Update milestone lists
        milestone_list: List[Dict[str, Any]] = []
        for milestone_id, milestone_entry in sorted(epic_entry["milestones"].items()):
            statuses = milestone_statuses.get((epic_id, milestone_id), [])
            milestone_entry["status"] = aggregate_status(statuses)
            milestone_entry["tasks"].sort(key=lambda task: task["id"])
            milestone_list.append(milestone_entry)
        epic_entry["milestones"] = milestone_list

        # Derive epic status
        computed_status = aggregate_status(epic_statuses.get(epic_id, []))
        override_status = epic_status_override.get(epic_id)
        if override_status in {"blocked", "needs_improvement"}:
            final_status = override_status
        elif computed_status == "pending" and override_status and override_status != "pending":
            final_status = override_status
        elif computed_status and computed_status != "pending":
            final_status = computed_status
        else:
            final_status = override_status or computed_status or "pending"
        epic_entry["status"] = final_status

        # Normalise domain from observed domains if available
        observed_domains = [item for item in epic_domains.get(epic_id, []) if item]
        if observed_domains:
            dominant = Counter(observed_domains).most_common(1)[0][0]
            epic_entry["domain"] = dominant
        else:
            epic_entry["domain"] = (epic_entry.get("domain") or "product").lower()

        document_epics.append(epic_entry)

    return {"epics": document_epics}


def load_roadmap_with_db_fallback(roadmap_path: Path) -> Dict[str, Any]:
    document = load_yaml(roadmap_path)
    epics = document.get("epics") if isinstance(document, dict) else None
    if epics:
        return document
    db_path = roadmap_path.with_name("orchestrator.db")
    fallback = build_roadmap_from_db(db_path)
    if fallback.get("epics"):
        try:
            roadmap_path.parent.mkdir(parents=True, exist_ok=True)
            serialized = yaml.safe_dump(fallback, sort_keys=False)
            roadmap_path.write_text(serialized, encoding="utf-8")
        except OSError:
            pass
        return fallback
    return document if isinstance(document, dict) else {"epics": []}


def normalise_status(value: Any) -> str:
    if isinstance(value, str):
        return value.strip().lower()
    return ""


def extract_critic_names(exit_criteria: Iterable[Any]) -> List[str]:
    critics: List[str] = []
    for entry in exit_criteria or []:
        if isinstance(entry, str) and entry.lower().startswith("critic:"):
            critics.append(entry.split(":", 1)[1].strip())
        elif isinstance(entry, dict):
            critic_val = entry.get("critic")
            if isinstance(critic_val, str):
                critics.append(critic_val.strip())
    return critics


@dataclass
class TaskRecord:
    task_id: str
    title: str
    status: str
    domain: str
    dependencies: List[str] = field(default_factory=list)
    critics: List[str] = field(default_factory=list)
    critic_groups: List[str] = field(default_factory=list)
    group: str = "core"


def build_task_index(roadmap: Dict[str, Any]) -> Tuple[Dict[str, TaskRecord], Dict[str, Dict[str, Any]]]:
    tasks: Dict[str, TaskRecord] = {}
    domain_features: Dict[str, Dict[str, Any]] = {}

    for epic in roadmap.get("epics", []):
        epic_id = str(epic.get("id", "")).strip() or "E_UNKNOWN"
        domain = str(epic.get("domain", "") or "").strip().lower() or "product"

        for milestone in epic.get("milestones", []):
            for task in milestone.get("tasks", []):
                task_id = str(task.get("id", "")).strip()
                if not task_id:
                    continue
                task_domain = str(task.get("domain", "") or domain).strip().lower() or domain
                status = normalise_status(task.get("status"))
                title = str(task.get("title", "") or "").strip() or task_id
                deps = [str(dep).strip() for dep in task.get("dependencies", []) if str(dep).strip()]
                critics = extract_critic_names(task.get("exit_criteria", []))
                critic_groups = [critic_group(item) for item in critics] or [DEFAULT_CRITIC_GROUP]
                task_group = classify_task_group(task_domain, critic_groups, task_id)

                record = TaskRecord(
                    task_id=task_id,
                    title=title,
                    status=status,
                    domain=task_domain,
                    dependencies=deps,
                    critics=critics,
                    critic_groups=critic_groups,
                    group=task_group,
                )
                tasks[task_id.lower()] = record

                features = domain_features.setdefault(
                    task_domain,
                    {
                        "remaining": 0,
                        "blocked": 0,
                        "in_progress": 0,
                        "needs_review": 0,
                        "critics": {},
                        "critic_groups": {},
                        "task_groups": {},
                        "dependency_edges": 0,
                        "total": 0,
                        "recent_completion": 0.0,
                    },
                )

                features["total"] += 1
                if status != "done":
                    features["remaining"] += 1
                if status == "blocked":
                    features["blocked"] += 1
                elif status == "in_progress":
                    features["in_progress"] += 1
                elif status == "needs_review":
                    features["needs_review"] += 1

                if status != "done" and deps:
                    features["dependency_edges"] += len(deps)

                if status != "done":
                    for crit in critics:
                        counter = features["critics"].setdefault(crit, {"blocked": 0, "total": 0})
                        counter["total"] += 1
                        if status == "blocked":
                            counter["blocked"] += 1

                    group_counter = features["critic_groups"]
                    for group_name in critic_groups:
                        group_entry = group_counter.setdefault(group_name, {"blocked": 0, "total": 0})
                        group_entry["total"] += 1
                        if status == "blocked":
                            group_entry["blocked"] += 1

                    task_groups = features["task_groups"]
                    tg_entry = task_groups.setdefault(task_group, {"blocked": 0, "remaining": 0, "total": 0})
                    tg_entry["total"] += 1
                    if status != "done":
                        tg_entry["remaining"] += 1
                    if status == "blocked":
                        tg_entry["blocked"] += 1

    return tasks, domain_features


def load_balance_snapshot(path: Path) -> Dict[str, Any]:
    snapshot = load_json(path, {})
    if not isinstance(snapshot, dict):
        return {}
    return snapshot


def clamp_domain_biases(state: Dict[str, Any]) -> None:
    domains = state.get("domains")
    if not isinstance(domains, dict):
        return
    product = domains.setdefault("product", {})
    product_bias = float(product.get("bias", 0.0))
    if product_bias < 1.6:
        product["bias"] = 1.6
    product_q = float(product.get("q_value", 0.0))
    if product_q < 0.0:
        product["q_value"] = 0.0

    mcp = domains.setdefault("mcp", {})
    mcp_bias = float(mcp.get("bias", 0.0))
    if mcp_bias > -1.2:
        mcp["bias"] = -1.2
    mcp_q = float(mcp.get("q_value", 0.0))
    if mcp_q > -0.6:
        mcp["q_value"] = -0.6


def ensure_policy_state(raw: Any) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        raw = {}
    domains = raw.setdefault("domains", {})
    if not isinstance(domains, dict):
        raw["domains"] = {}
        domains = raw["domains"]
    for domain in ("product", "mcp"):
        entry = domains.setdefault(domain, {})
        entry.setdefault("q_value", 0.0)
        entry.setdefault("count", 0)
        if domain == "product":
            entry.setdefault("bias", 2.0)
        elif domain == "mcp":
            entry.setdefault("bias", -1.0)
        else:
            entry.setdefault("bias", 0.0)
        entry.setdefault("last_reward", 0.0)
    raw.setdefault("epsilon", 0.12)
    raw.setdefault("epsilon_min", 0.01)
    raw.setdefault("epsilon_decay", 0.99)
    raw.setdefault("learning_rate", 0.25)
    raw.setdefault("discount", 0.8)
    raw.setdefault("task_adjustments", {})
    raw.setdefault("last_decision", {})
    raw.setdefault("providers", {})
    clamp_domain_biases(raw)
    return raw


def compute_domain_scores(
    domains: Dict[str, Dict[str, Any]],
    domain_features: Dict[str, Dict[str, Any]],
    balance_snapshot: Dict[str, Any],
    task_adjustments: Dict[str, float],
) -> Dict[str, Dict[str, Any]]:
    scores: Dict[str, Dict[str, Any]] = {}
    product_backlog = domain_features.get("product", {}).get("remaining", 0)
    product_blocked = domain_features.get("product", {}).get("blocked", 0)
    for domain, features in domain_features.items():
        if features.get("total", 0) == 0:
            continue
        base = domains.get(domain, {"q_value": 0.0, "bias": 0.0})
        q_value = float(base.get("q_value", 0.0))
        bias = float(base.get("bias", 0.0))

        remaining = features.get("remaining", 0)
        blocked = features.get("blocked", 0)
        in_progress = features.get("in_progress", 0)
        dependency_edges = features.get("dependency_edges", 0)

        pressure = math.log(remaining + 1.0) + 0.6 * math.log(blocked + 1.0)
        progress = math.log(in_progress + 1.0)
        deps = math.log(dependency_edges + 1.0) * 0.25

        preference = 0.0
        if domain == "product":
            preference = 2.25
        elif domain == "mcp":
            preference = -1.25

        balance_term = 0.0
        if domain == "product":
            product_streak = float(balance_snapshot.get("product_blockers_streak", 0))
            recent = balance_snapshot.get("recent_domains") or []
            recent_mcp = sum(1 for item in recent if item == "mcp")
            recent_product = sum(1 for item in recent if item == "product")
            backlog_pressure = math.log(product_backlog + 1.0) if product_backlog else 0.0
            balance_term = 0.9 * (product_streak + max(0, recent_mcp - recent_product)) + backlog_pressure
        else:
            product_streak = float(balance_snapshot.get("product_blockers_streak", 0))
            balance_term = -0.65 * product_streak
            if product_backlog > 0:
                balance_term -= 1.5
            if product_blocked > 0:
                balance_term -= 0.5

        adjustment_sum = 0.0
        if task_adjustments:
            domain_key = f"domain:{domain}"
            adjustment_sum += task_adjustments.get(domain_key, 0.0)
            task_groups = features.get("task_groups", {})
            for group_name in task_groups.keys():
                adjustment_sum += task_adjustments.get(f"group:{group_name}", 0.0)
            legacy_prefix = domain[:1]
            for key, delta in task_adjustments.items():
                if ":" not in key and key.startswith(legacy_prefix):
                    adjustment_sum += delta

        score = q_value + bias + preference + pressure - progress + balance_term + adjustment_sum - deps
        if domain == "mcp" and product_backlog > 0:
            score -= 4.0
        if domain == "mcp":
            score = min(score, -5.0)
        scores[domain] = {
            "score": score,
            "q_value": q_value,
            "bias": bias,
            "pressure": pressure,
            "progress": progress,
            "balance_term": balance_term,
            "adjustment": adjustment_sum,
            "remaining": remaining,
            "blocked": blocked,
            "in_progress": in_progress,
        }
    return scores


def select_domain(state: Dict[str, Any], scores: Dict[str, Dict[str, Any]]) -> Tuple[str, bool]:
    if not scores:
        return "product", False
    epsilon = float(state.get("epsilon", 0.25))
    explore = random.random() < epsilon
    product_stats = scores.get("product")
    if product_stats and product_stats.get("remaining", 0) > 0:
        if explore:
            return "product", True
    if explore:
        choice = random.choice(list(scores.keys()))
        return choice, True
    choice = max(scores.items(), key=lambda item: item[1]["score"])[0]
    if product_stats and product_stats.get("remaining", 0) > 0 and choice != "product":
        choice = "product"
    if FORCE_PRODUCT and not ALLOW_MCP:
        if product_stats or "product" in scores:
            return "product", False
    return choice, False


def format_prompt_directive(domain: str, action: str, reason: str, tasks: List[TaskRecord], critics: List[str]) -> str:
    lines = [
        f"Policy target: focus on the {domain.upper()} domain this cycle.",
    ]
    if action == "idle":
        lines.append("Primary action: idle (no remaining work detected).")
        if reason:
            lines.append(f"Reasoning: {reason}")
        lines.append("Stand down automation and wait for new work before relaunching.")
        return "\n".join(lines)

    lines.append(f"Primary action: {action}.")
    if critics:
        joined = ", ".join(sorted(set(critics)))
        lines.append(f"Critics (run when available): {joined}.")
    if tasks:
        top = "; ".join(f"{task.task_id} ({task.status}) – {task.title}" for task in tasks[:4])
        lines.append(f"Top priorities: {top}.")
    if reason:
        lines.append(f"Reasoning: {reason}")
    return "\n".join(lines)


def infer_action(domain: str, domain_features: Dict[str, Any]) -> str:
    """
    Infer autopilot action based on available tasks.
    CRITICAL: Returns 'idle' if no workable tasks available (prevents loops).
    """
    features: Dict[str, Any] = domain_features if isinstance(domain_features, dict) else {}
    try:
        remaining = int(features.get("remaining", 0) or 0)
    except (TypeError, ValueError):
        remaining = 0
    try:
        blocked = int(features.get("blocked", 0) or 0)
    except (TypeError, ValueError):
        blocked = 0
    try:
        in_progress = int(features.get("in_progress", 0) or 0)
    except (TypeError, ValueError):
        in_progress = 0

    # CRITICAL FIX: If no pending tasks and only blocked/in_progress tasks exist, go idle
    # This prevents the autopilot from looping on tasks it can't actually work on
    workable_tasks = remaining  # Only pending tasks are workable

    if workable_tasks <= 0:
        # No pending tasks - either all done, all blocked, or all in-progress
        # Going idle prevents loop on blocked/in-progress tasks
        return "idle"

    # ADDITIONAL CHECK: If ALL remaining tasks are blocked, also idle
    # (This shouldn't happen if remaining only counts pending, but defensive)
    total_tasks = remaining + blocked + in_progress
    if total_tasks > 0 and blocked >= total_tasks:
        return "idle"  # Everything is blocked, nothing to do

    if domain != "product":
        return "monitor"

    return "execute_tasks"


def critics_backoff_active() -> bool:
    return False


def decision_payload(
    domain: str,
    action: str,
    scores: Dict[str, Dict[str, Any]],
    explore: bool,
    domain_features: Dict[str, Dict[str, Any]],
    task_records: List[TaskRecord],
    critics: List[str],
    reason: str,
) -> Dict[str, Any]:
    return {
        "domain": domain,
        "action": action,
        "exploration": explore,
        "scores": scores,
        "reason": reason,
        "critics": critics,
        "top_tasks": [
            {
                "id": task.task_id,
                "title": task.title,
                "status": task.status,
                "dependencies": task.dependencies,
                "critics": task.critics,
                "group": task.group,
                "critic_groups": task.critic_groups,
            }
            for task in task_records[:8]
        ],
        "domain_snapshot": domain_features,
    }


def decision_reason(
    domain: str,
    explore: bool,
    score: Dict[str, Any],
    action: str,
    features: Optional[Dict[str, Any]],
) -> str:
    if action == "idle":
        remaining = 0
        blocked = 0
        if isinstance(features, dict):
            try:
                remaining = int(features.get("remaining", 0) or 0)
            except (TypeError, ValueError):
                remaining = 0
            try:
                blocked = int(features.get("blocked", 0) or 0)
            except (TypeError, ValueError):
                blocked = 0
        return (
            f"No active tasks detected in {domain.upper()} (remaining={remaining}, blocked={blocked}). "
            "Automation will idle until new work appears in the roadmap."
        )
    if explore:
        return f"Exploration step (epsilon-greedy) to keep policy adaptable."
    score_val = score.get("score", 0.0)
    pressure = score.get("pressure", 0.0)
    balance = score.get("balance_term", 0.0)
    blocked = score.get("blocked", 0)
    return (
        f"Weighted score={score_val:.2f} (pressure={pressure:.2f}, balance={balance:.2f}, blocked={blocked}). "
        f"Action '{action}' chosen to maximise long-term reward."
    )


def tasks_for_domain(domain: str, records: Dict[str, TaskRecord], adjustments: Dict[str, float]) -> List[TaskRecord]:
    filtered = [
        task for task in records.values() if task.domain == domain and task.status != "done"
    ]
    def priority(task: TaskRecord) -> Tuple[int, float]:
        status_priority = {"in_progress": 0, "pending": 1, "needs_review": 2, "blocked": 3}
        base = status_priority.get(task.status, 4)
        domain_bonus = adjustments.get(f"domain:{task.domain}", 0.0)
        group_bonus = adjustments.get(f"group:{task.group}", 0.0)
        legacy_bonus = adjustments.get(task.task_id.lower(), 0.0) + adjustments.get(f"task:{task.task_id.lower()}", 0.0)
        adj = domain_bonus + group_bonus + legacy_bonus
        return (base, -adj)

    filtered.sort(key=priority)
    return filtered


def critics_for_tasks(tasks: List[TaskRecord]) -> List[str]:
    result: List[str] = []
    for task in tasks:
        for critic in task.critics:
            if critic not in result:
                result.append(critic)
    return result


def append_history(path: Path, event: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event) + "\n")


def run_decision(
    state_path: Path,
    history_path: Path,
    roadmap_path: Path,
    balance_path: Path,
    roadmap_data: Optional[Dict[str, Any]] = None,
    balance_snapshot: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if roadmap_data is None:
        roadmap = load_roadmap_with_db_fallback(roadmap_path)
    else:
        roadmap = dict(roadmap_data)
        if not isinstance(roadmap, dict) or not roadmap.get("epics"):
            roadmap = load_roadmap_with_db_fallback(roadmap_path)
    tasks, domain_features = build_task_index(roadmap)
    if balance_snapshot is None:
        balance_snapshot = load_balance_snapshot(balance_path)
    else:
        balance_snapshot = dict(balance_snapshot)
    state = ensure_policy_state(load_json(state_path, {}))

    scores = compute_domain_scores(
        state["domains"],
        domain_features,
        balance_snapshot,
        state.get("task_adjustments", {}),
    )

    domain, explore = select_domain(state, scores)
    product_features = domain_features.get("product", {})
    if product_features.get("remaining", 0) > 0 or product_features.get("blocked", 0) > 0:
        domain = "product"
        explore = False
    chosen_features = domain_features.get(domain, {})
    action = infer_action(domain, chosen_features)
    task_records = tasks_for_domain(domain, tasks, state.get("task_adjustments", {}))
    critic_list = critics_for_tasks(task_records[:5])
    reason = decision_reason(domain, explore, scores.get(domain, {}), action, chosen_features)
    prompt_directive = format_prompt_directive(domain, action, reason, task_records, critic_list)

    payload = decision_payload(
        domain,
        action,
        scores,
        explore,
        domain_features.get(domain, {}),
        task_records,
        critic_list,
        reason,
    )
    payload["prompt_directive"] = prompt_directive
    payload["timestamp"] = time.time()

    state["last_decision"] = {
        "domain": domain,
        "action": action,
        "exploration": explore,
        "scores": scores,
        "decision_snapshot": payload,
        "prompt_directive": prompt_directive,
        "taken_at": time.time(),
    }

    epsilon = float(state.get("epsilon", 0.25))
    epsilon = max(float(state.get("epsilon_min", 0.05)), epsilon * float(state.get("epsilon_decay", 0.985)))
    state["epsilon"] = epsilon

    dump_json(state_path, state)

    append_history(
        history_path,
        {
            "event": "decision",
            "timestamp": time.time(),
            "domain": domain,
            "action": action,
            "exploration": explore,
            "scores": scores,
            "chosen_features": domain_features.get(domain, {}),
        },
    )

    return payload


def decide_command(args: argparse.Namespace) -> int:
    payload = run_decision(
        state_path=Path(args.state),
        history_path=Path(args.history),
        roadmap_path=Path(args.roadmap),
        balance_path=Path(args.balance),
    )
    print(json.dumps(payload, indent=2))
    return 0


def extract_task_ids(entries: Iterable[str]) -> List[str]:
    ids: List[str] = []
    for entry in entries or []:
        if not isinstance(entry, str):
            continue
        match = TASK_ID_PATTERN.search(entry.upper())
        if match:
            ids.append(match.group(1).lower())
    return ids


def rewarded_domains(
    completed_ids: List[str],
    blocker_ids: List[str],
    task_index: Dict[str, TaskRecord],
) -> Tuple[Dict[str, int], Dict[str, int]]:
    completed_counts: Dict[str, int] = {}
    blocker_counts: Dict[str, int] = {}

    for task_id in completed_ids:
        record = task_index.get(task_id)
        if record:
            completed_counts[record.domain] = completed_counts.get(record.domain, 0) + 1
    for task_id in blocker_ids:
        record = task_index.get(task_id)
        if record:
            blocker_counts[record.domain] = blocker_counts.get(record.domain, 0) + 1
    return completed_counts, blocker_counts


def reward_from_summary(
    summary: Dict[str, Any],
    decision: Dict[str, Any],
    task_index: Dict[str, TaskRecord],
) -> Tuple[float, Dict[str, Any]]:
    completed_ids = extract_task_ids(summary.get("completed_tasks", []))
    blocker_ids = extract_task_ids(summary.get("blockers", []))
    notes = str(summary.get("notes", "") or "").lower()

    completed_counts, blocker_counts = rewarded_domains(completed_ids, blocker_ids, task_index)

    domain = decision.get("domain", "product")
    action = decision.get("action", "execute_tasks")

    success = completed_counts.get(domain, 0)
    cross_success = sum(count for dom, count in completed_counts.items() if dom != domain)
    failures = blocker_counts.get(domain, 0)
    cross_failures = sum(count for dom, count in blocker_counts.items() if dom != domain)

    reward = 2.0 * success + 0.8 * cross_success - 1.8 * failures - 0.4 * cross_failures
    if domain == "product":
        reward += 0.35 * success + 0.15 * cross_success
        if success > 0:
            reward += 0.15
        if failures > 0:
            reward -= 0.3
    elif domain == "mcp":
        reward -= 1.2
        if success == 0:
            reward -= 0.6
        reward -= 0.2 * cross_failures
        reward += 0.1 * cross_success

    meta = summary.get("meta") or {}
    provider = (meta.get("provider") or "").strip().lower()
    fallback_used = bool(meta.get("fallback_used"))
    duration_seconds = float(meta.get("duration_seconds") or 0.0)
    attempt_count = int(meta.get("attempt") or 0)
    status_flag = (meta.get("status") or "").strip().lower()

    if provider == "claude":
        reward -= 0.4
    elif provider == "codex":
        reward += 0.05

    if fallback_used:
        reward -= 0.2

    if attempt_count > 1:
        reward -= 0.1 * (attempt_count - 1)

    if duration_seconds > 0:
        reward -= min(duration_seconds / 600.0, 0.4)

    if "timeout" in notes or "worker timed out" in notes:
        reward -= 1.0
    if "invalid summary" in notes:
        reward -= 0.5
    if action == "recover_critics" and success == 0 and failures > 0:
        reward -= 1.0

    telemetry = {
        "completed": completed_counts,
        "blockers": blocker_counts,
        "notes_flag_timeout": "timeout" in notes,
        "notes_flag_invalid_summary": "invalid summary" in notes,
        "meta": meta,
        "status": status_flag,
    }

    return reward, telemetry


def update_task_adjustments(
    adjustments: Dict[str, float],
    completed_ids: List[str],
    blocker_ids: List[str],
    lr: float,
    task_index: Dict[str, TaskRecord],
) -> Dict[str, float]:
    updated = dict(adjustments)

    def apply(task_ids: Iterable[str], delta: float) -> None:
        for task_id in task_ids:
            record = task_index.get(task_id)
            if not record:
                continue
            if record.domain == "mcp" and delta > 0:
                continue
            domain_key = f"domain:{record.domain}"
            group_key = f"group:{record.group}"
            updated[domain_key] = updated.get(domain_key, 0.0) + delta
            if group_key:
                updated[group_key] = updated.get(group_key, 0.0) + delta

    step = lr * 0.5
    apply(completed_ids, step)
    apply(blocker_ids, -step)

    # Prune tiny entries to keep the dictionary compact.
    cleaned = {key: value for key, value in updated.items() if abs(value) > 1e-6}
    return cleaned


def update_provider_metrics(state: Dict[str, Any], meta: Dict[str, Any], reward: float) -> None:
    providers = state.setdefault("providers", {})
    provider = (meta.get("provider") or "").strip().lower()
    if not provider:
        return
    entry = providers.setdefault(
        provider,
        {"count": 0, "total_reward": 0.0, "fallbacks": 0, "avg_reward": 0.0, "last_duration": 0.0},
    )
    entry["count"] += 1
    entry["total_reward"] += reward
    entry["last_duration"] = float(meta.get("duration_seconds") or 0.0)
    if meta.get("fallback_used"):
        entry["fallbacks"] = entry.get("fallbacks", 0) + 1
    entry["avg_reward"] = entry["total_reward"] / max(entry["count"], 1)


def run_update(
    state_path: Path,
    history_path: Path,
    roadmap_path: Path,
    summary: Dict[str, Any],
    decision_payload: Optional[Dict[str, Any]] = None,
    roadmap_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if roadmap_data is None:
        roadmap = load_roadmap_with_db_fallback(roadmap_path)
    else:
        roadmap = dict(roadmap_data)
        if not isinstance(roadmap, dict) or not roadmap.get("epics"):
            roadmap = load_roadmap_with_db_fallback(roadmap_path)
    task_index, _ = build_task_index(roadmap)

    decision_snapshot = dict(decision_payload or {})
    state = ensure_policy_state(load_json(state_path, {}))
    last_decision = state.get("last_decision") or {}
    if not decision_snapshot and last_decision:
        decision_snapshot = last_decision.get("decision_snapshot", {})

    summary_payload = summary or {}
    reward, telemetry = reward_from_summary(summary_payload, decision_snapshot, task_index)
    meta = summary_payload.get("meta") or {}
    lr = float(state.get("learning_rate", 0.25))
    discount = float(state.get("discount", 0.8))

    domain = decision_snapshot.get("domain", "product")
    domain_state = state["domains"].setdefault(domain, {"q_value": 0.0, "count": 0, "bias": 0.0})
    old_q = float(domain_state.get("q_value", 0.0))
    new_q = old_q + lr * (reward + discount * old_q - old_q)
    domain_state["q_value"] = new_q
    domain_state["last_reward"] = reward
    domain_state["count"] = int(domain_state.get("count", 0)) + 1
    domain_state["bias"] = float(domain_state.get("bias", 0.0)) + lr * 0.1 * reward
    if domain == "mcp":
        domain_state["q_value"] = min(domain_state["q_value"], -0.6)
        domain_state["bias"] = min(domain_state["bias"], -1.2)
    elif domain == "product":
        domain_state["bias"] = max(domain_state["bias"], 1.6)

    completed_ids = extract_task_ids(summary_payload.get("completed_tasks", []))
    blocker_ids = extract_task_ids(summary_payload.get("blockers", []))
    state["task_adjustments"] = update_task_adjustments(
        state.get("task_adjustments", {}),
        completed_ids,
        blocker_ids,
        lr,
        task_index,
    )
    update_provider_metrics(state, meta, reward)
    clamp_domain_biases(state)

    state["last_decision"] = {}
    dump_json(state_path, state)

    append_history(
        history_path,
        {
            "event": "update",
            "timestamp": time.time(),
            "decision_domain": domain,
            "reward": reward,
            "telemetry": telemetry,
            "completed_ids": completed_ids,
            "blocker_ids": blocker_ids,
            "meta": meta,
        },
    )

    return {"reward": reward, "telemetry": telemetry}


def update_command(args: argparse.Namespace) -> int:
    try:
        summary = json.loads(sys.stdin.read())
    except json.JSONDecodeError:
        summary = {}

    decision_payload = load_json(Path(args.decision_file), {})
    result = run_update(
        state_path=Path(args.state),
        history_path=Path(args.history),
        roadmap_path=Path(args.roadmap),
        summary=summary,
        decision_payload=decision_payload,
    )

    print(json.dumps(result, indent=2))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    decide_parser = subparsers.add_parser("decide", help="Emit the next autopilot action plan.")
    decide_parser.add_argument("--state", default=str(DEFAULT_STATE), help="Policy state file path.")
    decide_parser.add_argument("--history", default=str(DEFAULT_HISTORY), help="History log path.")
    decide_parser.add_argument("--roadmap", default=str(DEFAULT_ROADMAP), help="Roadmap YAML path.")
    decide_parser.add_argument("--balance", default=str(DEFAULT_BALANCE), help="Balance JSON path.")
    decide_parser.set_defaults(func=decide_command)

    update_parser = subparsers.add_parser("update", help="Update RL policy from autopilot summary JSON (stdin).")
    update_parser.add_argument("--state", default=str(DEFAULT_STATE), help="Policy state file path.")
    update_parser.add_argument("--history", default=str(DEFAULT_HISTORY), help="History log path.")
    update_parser.add_argument("--roadmap", default=str(DEFAULT_ROADMAP), help="Roadmap YAML path.")
    update_parser.add_argument("--decision-file", required=True, help="Path to the most recent decision payload JSON.")
    update_parser.set_defaults(func=update_command)

    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
