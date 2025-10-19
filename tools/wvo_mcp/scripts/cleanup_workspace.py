#!/usr/bin/env python3
"""
Workspace cleanup helper executed before each MCP autopilot cycle.

The goal is gentle hygiene without blowing away evidence:
  * Deduplicate bullet entries in state/context.md under known sections.
  * Deduplicate bullet entries in docs/orchestration/director_dana_escalation_*.md.
  * Normalise task memo JSON files to avoid duplicated statuses/next entries.
  * Remove stale worker logs stored under state/worker_logs (keep most recent 10).
  * Truncate /tmp/wvo_autopilot.log to prevent endless growth.
  * Mark runtime artefacts as skip-worktree so git guardrails see a clean tree.
  * Maintain the .clean_worktree sentinel to suppress autopilot git sync.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, List, Tuple

ROOT = Path(__file__).resolve().parent.parent.parent
STATE_DIR = ROOT / "state"
DOCS_DIR = ROOT / "docs" / "orchestration"
WORKER_LOG_DIR = STATE_DIR / "worker_logs"
AUTOPILOT_LOG = Path("/tmp/wvo_autopilot.log")
PLAYWRIGHT_DIRS = [
    ROOT / "apps" / "web" / "playwright",
    ROOT / "apps" / "web" / "test-results",
]
PLAYWRIGHT_CONFIG = ROOT / "apps" / "web" / "playwright.config.ts"
CLEAN_WORKTREE_SENTINEL = ROOT / ".clean_worktree"
SKIP_WORKTREE_PATTERNS = [
    "state/context.md",
    "state/analytics/*",
    "state/autopilot_*.json",
    "state/journal/*",
    "state/checkpoint.json",
    "state/critics/*",
    "state/heavy_queue.json",
    "state/limits/*",
    "state/policy/autopilot_policy.json",
    "state/quality/*",
    "state/task_memos/*",
    "state/telemetry/*",
    "state/worker_logs/*",
    "tmp/critics_run_output.json",
    ".accounts/codex/*",
    ".codex/config.toml",
]

LEDGER_DIR = STATE_DIR / "journal"
LEDGER_FILE = LEDGER_DIR / "state_ledger.jsonl"
LEDGER_EXTRA_PATHS = [
    ROOT / "tmp" / "critics_run_output.json",
]


def dedupe_section_bullets(path: Path, section_headers: Iterable[str]) -> None:
    if not path.exists():
        return
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    header_set = set(section_headers)
    new_lines: list[str] = []
    in_section = False
    seen: set[str] = set()

    for line in lines:
        stripped = line.strip()
        if stripped in header_set:
            in_section = True
            seen.clear()
            new_lines.append(line)
            continue
        if in_section and stripped.startswith("### ") and stripped not in header_set:
            in_section = False
        if in_section and stripped.startswith("- "):
            if stripped in seen:
                continue
            seen.add(stripped)
        new_lines.append(line)

    path.write_text("\n".join(new_lines).rstrip() + "\n", encoding="utf-8")


def dedupe_consecutive_lines(path: Path) -> None:
    if not path.exists():
        return
    lines = path.read_text(encoding="utf-8").splitlines()
    new_lines: list[str] = []
    prev: str | None = None
    for line in lines:
        if line == prev:
            continue
        new_lines.append(line)
        prev = line
    path.write_text("\n".join(new_lines).rstrip() + "\n", encoding="utf-8")


def normalise_task_memo(path: Path) -> None:
    if not path.exists():
        return
    try:
        data = json.loads(path.read_text(encoding="utf-8") or "{}")
    except json.JSONDecodeError:
        return
    if not isinstance(data, dict):
        return

    for key in ("statuses", "next"):
        value = data.get(key)
        if isinstance(value, list):
            seen = set()
            deduped = []
            for item in value:
                if item in seen:
                    continue
                seen.add(item)
                deduped.append(item)
            data[key] = deduped

    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def prune_worker_logs(directory: Path, keep: int = 10) -> None:
    if not directory.exists():
        return
    files = sorted(directory.glob("worker_*.log"))
    excess = files[:-keep]
    for file in excess:
        try:
            file.unlink()
        except OSError:
            pass


def truncate_log(path: Path, max_bytes: int = 5_000_000) -> None:
    if not path.exists():
        return
    try:
        if path.stat().st_size <= max_bytes:
            return
        data = path.read_bytes()[-max_bytes:]
        path.write_bytes(data)
    except OSError:
        pass


def main() -> None:
    record_state_snapshot()

    dedupe_section_bullets(
        STATE_DIR / "context.md",
        section_headers=(
            "### WeatherVane Product (domain: product)",
            "### WeatherVane Product",
        ),
    )

    for doc in DOCS_DIR.glob("director_dana_escalation_*.md"):
        dedupe_consecutive_lines(doc)

    normalise_task_memo(
        STATE_DIR / "task_memos" / "label-coordinate-with-director-dana-for-worker-restora.json"
    )

    prune_worker_logs(WORKER_LOG_DIR)
    truncate_log(AUTOPILOT_LOG)

    for directory in PLAYWRIGHT_DIRS:
        if directory.exists():
            for child in sorted(directory.glob("**/*"), reverse=True):
                if child.is_file():
                    try:
                        child.unlink()
                    except OSError:
                        pass
            try:
                directory.rmdir()
            except OSError:
                pass

    if PLAYWRIGHT_CONFIG.exists():
        try:
            PLAYWRIGHT_CONFIG.unlink()
        except OSError:
            pass

    ensure_skip_worktree(SKIP_WORKTREE_PATTERNS)
    ensure_clean_worktree_sentinel()


def ensure_skip_worktree(patterns: Iterable[str]) -> None:
    """Mark runtime artefacts as skip-worktree without disturbing fresh evidence."""
    git_dir = ROOT / ".git"
    if not git_dir.exists():
        return

    for pattern in patterns:
        tracked_files = list_tracked_paths(pattern)
        if not tracked_files:
            continue
        for tracked in tracked_files:
            try:
                subprocess.run(
                    ["git", "update-index", "--skip-worktree", tracked],
                    cwd=ROOT,
                    check=False,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            except OSError:
                continue


def list_tracked_paths(pattern: str) -> List[str]:
    try:
        result = subprocess.run(
            ["git", "ls-files", pattern],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError:
        return []

    if result.returncode != 0:
        return []

    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def ensure_clean_worktree_sentinel() -> None:
    try:
        CLEAN_WORKTREE_SENTINEL.touch(exist_ok=True)
    except OSError:
        pass


def iter_state_files() -> Iterable[Path]:
    ledger_root = LEDGER_DIR.resolve()
    if STATE_DIR.exists():
        for path in STATE_DIR.rglob("*"):
            if not path.is_file():
                continue
            try:
                resolved = path.resolve()
            except OSError:
                continue
            if resolved.is_relative_to(ledger_root):
                continue
            yield path
    for extra in LEDGER_EXTRA_PATHS:
        if extra.exists() and extra.is_file():
            yield extra


def compute_file_digest(path: Path) -> Tuple[str, int]:
    hasher = hashlib.sha256()
    size = 0
    try:
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                if not chunk:
                    break
                size += len(chunk)
                hasher.update(chunk)
    except OSError:
        return "", 0
    return hasher.hexdigest(), size


def record_state_snapshot() -> None:
    files = sorted(iter_state_files(), key=lambda item: item.relative_to(ROOT))
    aggregate = hashlib.sha256()
    entries: List[dict] = []
    total_bytes = 0

    for file_path in files:
        digest, size = compute_file_digest(file_path)
        if not digest:
            continue
        rel = str(file_path.relative_to(ROOT))
        aggregate.update(rel.encode("utf-8"))
        aggregate.update(digest.encode("utf-8"))
        entries.append({"path": rel, "sha256": digest, "bytes": size})
        total_bytes += size

    if not entries:
        return

    snapshot_hash = aggregate.hexdigest()
    timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    payload = {
        "timestamp": timestamp,
        "epoch": time.time(),
        "snapshot": snapshot_hash,
        "total_files": len(entries),
        "total_bytes": total_bytes,
        "entries": entries[:50],
        "truncated": len(entries) > 50,
    }

    try:
        LEDGER_DIR.mkdir(parents=True, exist_ok=True)
        with LEDGER_FILE.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload) + "\n")
    except OSError:
        pass


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # pragma: no cover - defensive
        print(f"[cleanup_workspace] encountered error: {exc}", file=sys.stderr)
        sys.exit(1)
