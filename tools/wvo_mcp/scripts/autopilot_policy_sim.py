#!/usr/bin/env python3
"""
Autopilot Policy Simulator

Run a lightweight reinforcement-learning harness for the WeatherVane autopilot
policy. The simulator mirrors high-level roadmap dynamics with a cheap,
fully deterministic environment so we can exercise the policy over hundreds of
steps in seconds.

Usage:
    python tools/wvo_mcp/scripts/autopilot_policy_sim.py --episodes 50 --max-steps 200

The simulator produces console metrics, writes per-step telemetry to a CSV, and
stores learning state under dedicated policy files (separate from production
autopilot state).
"""

from __future__ import annotations

import argparse
import csv
import sys
import json
import math
import random
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import yaml
import importlib.util


ROOT = Path(__file__).resolve().parents[3]
POLICY_SCRIPT = ROOT / "tools" / "wvo_mcp" / "scripts" / "autopilot_policy.py"

_POLICY_SPEC = importlib.util.spec_from_file_location("wvo_autopilot_policy", str(POLICY_SCRIPT))
_POLICY_MODULE = importlib.util.module_from_spec(_POLICY_SPEC)
sys.modules[_POLICY_SPEC.name] = _POLICY_MODULE
assert _POLICY_SPEC.loader is not None
_POLICY_SPEC.loader.exec_module(_POLICY_MODULE)


def _critic_group(name: str) -> str:
    try:
        return _POLICY_MODULE.critic_group(name)
    except Exception:
        return "general"


def _task_group(domain: str, critic_groups: Iterable[str], task_id: str) -> str:
    try:
        return _POLICY_MODULE.classify_task_group(domain, critic_groups, task_id)
    except Exception:
        return f"{domain}_core"


# ---- Simulation primitives -------------------------------------------------


@dataclass
class SimTask:
    task_id: str
    domain: str
    critic: str
    status: str = "pending"  # pending | in_progress | blocked | needs_review | done
    critic_group: str = "general"
    group: str = "core"


class BalanceTracker:
    """Mirror the autopilot balance file updated in the real loop."""

    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.product_completed_total = 0
        self.mcp_completed_total = 0
        self.product_blockers_total = 0
        self.mcp_blockers_total = 0
        self.product_blockers_streak = 0
        self.recent_domains: List[str] = []
        self.needs_escalation = False

    def record(self, domain: str, completed: Iterable[str], blockers: Iterable[str]) -> None:
        completed_list = list(completed)
        blockers_list = list(blockers)

        if domain == "product":
            self.product_completed_total += len(completed_list)
            self.product_blockers_total += len(blockers_list)
            if blockers_list:
                self.product_blockers_streak += 1
            elif completed_list:
                self.product_blockers_streak = 0
            else:
                self.product_blockers_streak = max(self.product_blockers_streak - 1, 0)
        else:
            self.mcp_completed_total += len(completed_list)
            self.mcp_blockers_total += len(blockers_list)

        if completed_list:
            label = domain
        elif blockers_list:
            label = f"blocked_{domain}"
        else:
            label = "none"
        self.recent_domains.append(label)
        self.recent_domains = self.recent_domains[-12:]

        self.needs_escalation = self.product_blockers_streak >= 2

    def snapshot(self) -> Dict[str, object]:
        return {
            "product_completed_total": self.product_completed_total,
            "mcp_completed_total": self.mcp_completed_total,
            "product_blockers_total": self.product_blockers_total,
            "mcp_blockers_total": self.mcp_blockers_total,
            "product_blockers_streak": self.product_blockers_streak,
            "recent_domains": self.recent_domains,
            "needs_escalation": self.needs_escalation,
            "message": (
                f"Sim balance — recent={self.recent_domains}, "
                f"product_blockers_streak={self.product_blockers_streak}"
            ),
            "last_updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }

    def write(self, path: Path) -> Dict[str, object]:
        payload = self.snapshot()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return payload


class SimulationEnvironment:
    """Very small roadmap/backlog model used to stress the policy quickly."""

    PRODUCT_CRITICS = ["design_system", "exec_review", "tests", "prompt_budget"]
    MCP_CRITICS = ["tests", "manager_self_check", "health_check", "allocator"]

    def __init__(self, rng: random.Random, product_tasks: int = 28, mcp_tasks: int = 20) -> None:
        self.rng = rng
        self.initial_product_tasks = product_tasks
        self.initial_mcp_tasks = mcp_tasks
        self._task_index: Dict[str, SimTask] = {}
        self._next_product_id = 1000
        self._next_mcp_id = 6000
        self.metrics = {
            "product_completed": 0,
            "mcp_completed": 0,
            "product_blockers": 0,
            "mcp_blockers": 0,
        }
        self.step_index = 0
        self.reset()

    # -- core lifecycle ------------------------------------------------------

    def reset(self) -> None:
        self._task_index.clear()
        self._next_product_id = 1000
        self._next_mcp_id = 6000
        self.metrics = {
            "product_completed": 0,
            "mcp_completed": 0,
            "product_blockers": 0,
            "mcp_blockers": 0,
        }
        self.step_index = 0

        self._spawn_initial_tasks("product", self.initial_product_tasks)
        self._spawn_initial_tasks("mcp", self.initial_mcp_tasks)

    # -- roadmap serialisation -----------------------------------------------

    def write_roadmap(self, path: Path) -> None:
        payload = self.roadmap_payload()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(yaml.safe_dump(payload, sort_keys=False), encoding="utf-8")

    def roadmap_payload(self) -> Dict[str, object]:
        """Emit a synthetic roadmap structure the policy can analyse."""
        def domain_payload(domain: str) -> Dict[str, object]:
            critic_pool = self.PRODUCT_CRITICS if domain == "product" else self.MCP_CRITICS
            tasks = [
                self._task_index[task_id]
                for task_id in sorted(self._task_index)
                if self._task_index[task_id].domain == domain
            ]
            task_entries = []
            for task in tasks:
                exit_criteria: List[str] = []
                if task.status in ("blocked", "in_progress"):
                    exit_criteria = [f"critic:{task.critic}"]
                dependencies = []
                if task.status == "blocked":
                    dependencies = [f"{task.domain.upper()}_UNBLOCK"]
                task_entries.append(
                    {
                        "id": task.task_id,
                        "title": f"{task.domain.title()} task {task.task_id}",
                        "status": task.status,
                        "dependencies": dependencies,
                        "exit_criteria": exit_criteria,
                        "owner": "Sim-Autopilot",
                    }
                )
            return {
                "id": f"E_SIM_{domain.upper()}",
                "title": f"Simulated {domain.title()} Backlog",
                "description": f"Synthetic tasks for {domain} loop testing.",
                "domain": domain,
                "milestones": [
                    {
                        "id": f"M_SIM_{domain.upper()}",
                        "title": f"{domain.title()} milestone",
                        "tasks": task_entries,
                    }
                ],
            }

        roadmap = {
            "epics": [
                domain_payload("product"),
                domain_payload("mcp"),
            ]
        }
        return roadmap

    # -- environment mechanics -----------------------------------------------

    def remaining_count(self, domain: str) -> int:
        return sum(1 for task in self._task_index.values() if task.domain == domain and task.status != "done")

    def blocked_count(self, domain: str) -> int:
        return sum(1 for task in self._task_index.values() if task.domain == domain and task.status == "blocked")

    def in_progress_count(self, domain: str) -> int:
        return sum(1 for task in self._task_index.values() if task.domain == domain and task.status == "in_progress")

    def step(self, decision: Dict[str, object]) -> Tuple[Dict[str, object], Dict[str, object]]:
        """Apply the chosen domain/action and return a synthetic summary."""
        domain = str(decision.get("domain", "product")).lower()
        action = str(decision.get("action", "execute_tasks"))

        tasks = [task for task in self._task_index.values() if task.domain == domain]

        completed_ids: List[str] = []
        blocker_ids: List[str] = []
        notes: List[str] = []

        if action == "execute_tasks":
            candidates = [task for task in tasks if task.status in ("pending", "in_progress")]
            if candidates:
                success_count = 1 + self.rng.randint(0, min(2, len(candidates)))
                for task in self.rng.sample(candidates, k=success_count):
                    task.status = "done"
                    completed_ids.append(task.task_id)
            else:
                notes.append("timeout")

            # Chance of introducing a blocker if momentum is low.
            if self.rng.random() < 0.25:
                pending = [task for task in tasks if task.status == "pending"]
                if pending:
                    new_blocker = self.rng.choice(pending)
                    new_blocker.status = "blocked"
                    blocker_ids.append(new_blocker.task_id)

        elif action == "recover_critics":
            blocked_tasks = [task for task in tasks if task.status == "blocked"]
            if blocked_tasks:
                recover_count = max(1, math.ceil(len(blocked_tasks) * 0.3))
                for task in self.rng.sample(blocked_tasks, k=min(recover_count, len(blocked_tasks))):
                    task.status = "in_progress"
            else:
                notes.append("timeout")

            if self.rng.random() < 0.15:
                # Recovery succeeded quickly on one item.
                in_progress = [task for task in tasks if task.status == "in_progress"]
                if in_progress:
                    task = self.rng.choice(in_progress)
                    task.status = "done"
                    completed_ids.append(task.task_id)

        else:  # monitor / unknown
            if self.rng.random() < 0.1:
                notes.append("timeout")

        # Occasional chaos: add a blocker in the other domain to keep variety.
        if self.rng.random() < 0.05:
            other_domain = "product" if domain == "mcp" else "mcp"
            other_pending = [task for task in self._task_index.values() if task.domain == other_domain and task.status == "pending"]
            if other_pending:
                new_block = self.rng.choice(other_pending)
                new_block.status = "blocked"
                blocker_ids.append(new_block.task_id)

        self._ensure_backlog(domain)
        self._ensure_backlog("mcp" if domain == "product" else "product")

        # Metrics
        if domain == "product":
            self.metrics["product_completed"] += len(completed_ids)
            self.metrics["product_blockers"] += len(blocker_ids)
        else:
            self.metrics["mcp_completed"] += len(completed_ids)
            self.metrics["mcp_blockers"] += len(blocker_ids)

        in_progress_strings = [f"{task.task_id}: Continuing {task.domain} work" for task in tasks if task.status == "in_progress"]
        note_text = "; ".join(notes) if notes else "steady progress"

        summary = {
            "completed_tasks": [f"{task_id}: Completed {domain} slice" for task_id in completed_ids],
            "in_progress": in_progress_strings,
            "blockers": [f"{task_id}: Blocked due to critic gap" for task_id in blocker_ids],
            "next_focus": [f"Focus on {domain} backlog health"],
            "notes": note_text,
        }

        info = {
            "domain": domain,
            "action": action,
            "completed_ids": completed_ids,
            "blocked_ids": blocker_ids,
            "notes": notes,
        }

        provider = "codex"
        fallback_used = False
        model_name = "sim-codex"
        if self.rng.random() < 0.2 and domain == "mcp":
            provider = "claude"
            fallback_used = True
            model_name = "sim-claude"
        attempt_value = 2 if fallback_used else 1
        duration_value = max(5, int(self.rng.uniform(20, 120)))
        summary["meta"] = {
            "provider": provider,
            "model": model_name,
            "fallback_used": fallback_used,
            "attempt": attempt_value,
            "duration_seconds": duration_value,
            "status": "success",
        }
        info["provider"] = provider
        info["fallback_used"] = fallback_used

        self.step_index += 1
        return summary, info

    # -- helpers --------------------------------------------------------------

    def _spawn_initial_tasks(self, domain: str, total: int) -> None:
        blocked = max(3, total // 3)
        in_progress = max(2, total // 5)
        for _ in range(blocked):
            self._create_task(domain, "blocked")
        for _ in range(in_progress):
            self._create_task(domain, "in_progress")
        for _ in range(total - blocked - in_progress):
            self._create_task(domain, "pending")

    def _create_task(self, domain: str, status: str) -> None:
        if domain == "product":
            task_id = f"T{self._next_product_id}"
            self._next_product_id += 1
            critic = self.rng.choice(self.PRODUCT_CRITICS)
        else:
            task_id = f"T{self._next_mcp_id}"
            self._next_mcp_id += 1
            critic = self.rng.choice(self.MCP_CRITICS)
        critic_grp = _critic_group(critic)
        task_group = _task_group(domain, [critic_grp], task_id)
        self._task_index[task_id.lower()] = SimTask(
            task_id=task_id,
            domain=domain,
            critic=critic,
            status=status,
            critic_group=critic_grp,
            group=task_group,
        )

    def _ensure_backlog(self, domain: str) -> None:
        remaining = self.remaining_count(domain)
        if remaining < 6:
            for _ in range(6 - remaining):
                self._create_task(domain, "pending")


# ---- Policy bridge ---------------------------------------------------------


class PolicyRunner:
    """Thin wrapper for calling autopilot_policy.py without touching the real state."""

    def __init__(
        self,
        policy_script: Path,
        state_path: Path,
        history_path: Path,
        roadmap_path: Path,
        balance_path: Path,
    ) -> None:
        self.policy_script = policy_script
        self.state_path = state_path
        self.history_path = history_path
        self.roadmap_path = roadmap_path
        self.balance_path = balance_path
        self._decision_path: Optional[Path] = None
        self._decision_payload: Optional[Dict[str, object]] = None
        self._fast_decide = getattr(_POLICY_MODULE, "run_decision", None)
        self._fast_update = getattr(_POLICY_MODULE, "run_update", None)
        self._has_fast_path = callable(self._fast_decide) and callable(self._fast_update)

        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        self.history_path.parent.mkdir(parents=True, exist_ok=True)

    @property
    def uses_fast_path(self) -> bool:
        return self._has_fast_path

    def decide(
        self,
        roadmap_data: Optional[Dict[str, object]] = None,
        balance_snapshot: Optional[Dict[str, object]] = None,
    ) -> Dict[str, object]:
        if self._has_fast_path:
            payload = self._fast_decide(
                state_path=self.state_path,
                history_path=self.history_path,
                roadmap_path=self.roadmap_path,
                balance_path=self.balance_path,
                roadmap_data=roadmap_data,
                balance_snapshot=balance_snapshot,
            )
            self._decision_payload = payload
            return payload

        result = subprocess.run(
            [
                sys.executable,
                str(self.policy_script),
                "decide",
                "--state",
                str(self.state_path),
                "--history",
                str(self.history_path),
                "--roadmap",
                str(self.roadmap_path),
                "--balance",
                str(self.balance_path),
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"policy decide failed: {result.stderr.strip() or result.stdout.strip()}")

        try:
            decision = json.loads(result.stdout)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"invalid policy output: {exc}") from exc

        temp = tempfile.NamedTemporaryFile(mode="w", delete=False, encoding="utf-8")
        temp.write(result.stdout)
        temp.flush()
        temp.close()
        self._decision_path = Path(temp.name)
        return decision

    def update(
        self,
        summary: Dict[str, object],
        roadmap_data: Optional[Dict[str, object]] = None,
    ) -> Dict[str, object]:
        if self._has_fast_path:
            decision_payload = self._decision_payload or {}
            result = self._fast_update(
                state_path=self.state_path,
                history_path=self.history_path,
                roadmap_path=self.roadmap_path,
                summary=summary,
                decision_payload=decision_payload,
                roadmap_data=roadmap_data,
            )
            self._decision_payload = None
            return result

        if self._decision_path is None:
            raise RuntimeError("policy update called before decide")

        result = subprocess.run(
            [
                sys.executable,
                str(self.policy_script),
                "update",
                "--state",
                str(self.state_path),
                "--history",
                str(self.history_path),
                "--roadmap",
                str(self.roadmap_path),
                "--decision-file",
                str(self._decision_path),
            ],
            input=json.dumps(summary),
            check=False,
            capture_output=True,
            text=True,
        )

        try:
            self._decision_path.unlink(missing_ok=True)
        finally:
            self._decision_path = None

        if result.returncode != 0:
            raise RuntimeError(f"policy update failed: {result.stderr.strip() or result.stdout.strip()}")

        try:
            return json.loads(result.stdout or "{}")
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"invalid policy update output: {exc}") from exc


# ---- Simulation loop -------------------------------------------------------


def run_simulation(args: argparse.Namespace) -> None:
    rng = random.Random(args.seed)

    environment = SimulationEnvironment(rng)
    balance_tracker = BalanceTracker()

    state_path = Path(args.policy_state).expanduser()
    history_path = Path(args.policy_history).expanduser()
    roadmap_path = Path(args.roadmap_file).expanduser()
    balance_path = Path(args.balance_file).expanduser()
    csv_path = Path(args.csv).expanduser()

    if args.reset_policy:
        state_path.unlink(missing_ok=True)
        history_path.unlink(missing_ok=True)

    policy = PolicyRunner(
        policy_script=POLICY_SCRIPT,
        state_path=state_path,
        history_path=history_path,
        roadmap_path=roadmap_path,
        balance_path=balance_path,
    )

    metrics_rows: List[Dict[str, object]] = []
    episode_rewards: List[float] = []
    product_completion_total = 0
    mcp_completion_total = 0

    for episode in range(args.episodes):
        environment.reset()
        balance_tracker.reset()

        reward_sum = 0.0
        steps_taken = 0

        for step in range(args.max_steps):
            roadmap_payload = environment.roadmap_payload()
            if policy.uses_fast_path:
                balance_snapshot = balance_tracker.snapshot()
            else:
                environment.write_roadmap(roadmap_path)
                balance_snapshot = balance_tracker.write(balance_path)

            decision = policy.decide(roadmap_payload, balance_snapshot)
            summary, info = environment.step(decision)
            updated_roadmap = environment.roadmap_payload()
            if not policy.uses_fast_path:
                environment.write_roadmap(roadmap_path)

            reward_info = policy.update(summary, updated_roadmap)
            reward = float(reward_info.get("reward", 0.0))

            balance_tracker.record(info["domain"], info["completed_ids"], info["blocked_ids"])
            if not policy.uses_fast_path:
                balance_tracker.write(balance_path)

            reward_sum += reward
            steps_taken += 1

            product_completion_total += len(info["completed_ids"]) if info["domain"] == "product" else 0
            mcp_completion_total += len(info["completed_ids"]) if info["domain"] == "mcp" else 0

            metrics_rows.append(
                {
                    "episode": episode,
                    "step": step,
                    "domain": info["domain"],
                    "action": info["action"],
                    "reward": reward,
                    "completed": len(info["completed_ids"]),
                    "blocked": len(info["blocked_ids"]),
                    "remaining_product": environment.remaining_count("product"),
                    "blocked_product": environment.blocked_count("product"),
                    "remaining_mcp": environment.remaining_count("mcp"),
                    "blocked_mcp": environment.blocked_count("mcp"),
                }
            )

        episode_rewards.append(reward_sum / max(steps_taken, 1))
        if policy.uses_fast_path:
            environment.write_roadmap(roadmap_path)
            balance_tracker.write(balance_path)

    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        if metrics_rows:
            writer = csv.DictWriter(handle, fieldnames=list(metrics_rows[0].keys()))
            writer.writeheader()
            writer.writerows(metrics_rows)
        else:
            writer = csv.writer(handle)
            writer.writerow(["episode", "step", "domain", "action", "reward"])

    avg_reward = sum(episode_rewards) / max(len(episode_rewards), 1)
    avg_product_completion = product_completion_total / max(args.episodes * args.max_steps, 1)
    avg_mcp_completion = mcp_completion_total / max(args.episodes * args.max_steps, 1)

    print("==== Autopilot Policy Simulation ====")
    print(f"Episodes run         : {args.episodes}")
    print(f"Steps per episode    : {args.max_steps}")
    print(f"Average reward/step  : {avg_reward:.3f}")
    print(f"Avg product completions/step : {avg_product_completion:.3f}")
    print(f"Avg MCP completions/step     : {avg_mcp_completion:.3f}")
    print(f"Metrics CSV written  : {csv_path}")
    print(f"Policy state stored  : {state_path}")


# ---- CLI -------------------------------------------------------------------


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--episodes", type=int, default=20, help="Number of simulated episodes (default: 20).")
    parser.add_argument("--max-steps", type=int, default=100, help="Steps per episode (default: 100).")
    parser.add_argument("--seed", type=int, default=42, help="Random seed (default: 42).")
    parser.add_argument(
        "--policy-state",
        default=str(ROOT / "state" / "policy" / "autopilot_policy_sim.json"),
        help="Where to store simulation policy state (default: state/policy/autopilot_policy_sim.json).",
    )
    parser.add_argument(
        "--policy-history",
        default=str(ROOT / "state" / "analytics" / "autopilot_policy_history_sim.jsonl"),
        help="Where to log simulator policy decisions (default: state/analytics/autopilot_policy_history_sim.jsonl).",
    )
    parser.add_argument(
        "--balance-file",
        default=str(ROOT / "state" / "autopilot_balance_sim.json"),
        help="Synthetic balance file path (default: state/autopilot_balance_sim.json).",
    )
    parser.add_argument(
        "--roadmap-file",
        default=str(ROOT / "state" / "roadmap_sim.yaml"),
        help="Synthetic roadmap path (default: state/roadmap_sim.yaml).",
    )
    parser.add_argument(
        "--csv",
        default=str(ROOT / "state" / "analytics" / "autopilot_policy_sim.csv"),
        help="Per-step metrics CSV (default: state/analytics/autopilot_policy_sim.csv).",
    )
    parser.add_argument(
        "--reset-policy",
        action="store_true",
        help="Delete the simulator policy state/history before running.",
    )
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    if args.episodes <= 0 or args.max_steps <= 0:
        print("Episodes and steps must be positive integers.", file=sys.stderr)
        return 1
    run_simulation(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
