#!/usr/bin/env python3
"""
Account manager for WeatherVane autopilot.

Stores Codex / Claude account metadata and runtime cooldowns so the
autopilot can rotate between accounts and respect provider usage limits.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Set

import yaml

REPO_ROOT = Path(__file__).resolve().parents[3]
CONFIG_PATH = REPO_ROOT / "state" / "accounts.yaml"
RUNTIME_PATH = REPO_ROOT / "state" / "accounts_runtime.json"
ACCOUNTS_ROOT = REPO_ROOT / ".accounts"


def slugify(identifier: str) -> str:
    safe = []
    for ch in identifier:
        if ch.isalnum() or ch in ("-", "_"):
            safe.append(ch)
        else:
            safe.append("_")
    return "".join(safe) or "account"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_runtime() -> Dict[str, Dict[str, Dict[str, Any]]]:
    if not RUNTIME_PATH.exists():
        data: Dict[str, Dict[str, Dict[str, Any]]] = {"codex": {}, "claude": {}}
        RUNTIME_PATH.parent.mkdir(parents=True, exist_ok=True)
        RUNTIME_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")
        return data
    try:
        return json.loads(RUNTIME_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        data = {"codex": {}, "claude": {}}
        RUNTIME_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")
        return data


def write_runtime(data: Dict[str, Dict[str, Dict[str, Any]]]) -> None:
    RUNTIME_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def normalize_config(data: Dict[str, List[Dict[str, Any]]]) -> Dict[str, List[Dict[str, Any]]]:
    data.setdefault("codex", [])
    data.setdefault("claude", [])

    ACCOUNTS_ROOT.mkdir(parents=True, exist_ok=True)

    seen_codex_ids: Set[str] = set()
    seen_codex_homes: Dict[str, str] = {}
    seen_codex_emails: Dict[str, str] = {}

    for account in data["codex"]:
        account_id = (account.get("id") or "").strip()
        if not account_id:
            raise ValueError(
                "Codex account entry missing 'id'. Update state/accounts.yaml with unique ids for each account."
            )
        if account_id in seen_codex_ids:
            raise ValueError(
                f"Duplicate Codex account id '{account_id}' detected in state/accounts.yaml. "
                "Use unique ids for each Codex login."
            )
        seen_codex_ids.add(account_id)

        email = (account.get("email") or "").strip()
        if not email:
            raise ValueError(
                f"Codex account '{account_id}' missing required email in state/accounts.yaml. "
                "Add an 'email:' field so the autopilot can verify each login."
            )
        account["email"] = email
        email_key = email.lower()
        existing_email_id = seen_codex_emails.get(email_key)
        if existing_email_id and existing_email_id != account_id:
            raise ValueError(
                f"Codex accounts '{existing_email_id}' and '{account_id}' share the same email '{email}'. "
                "Each Codex account must map to a unique login."
            )
        seen_codex_emails[email_key] = account_id

        slug = slugify(account_id)
        if not account.get("home"):
            default_home = ACCOUNTS_ROOT / "codex" / slug
            account["home"] = str(default_home)
        home_path = Path(account["home"]).expanduser().resolve()
        existing_home_id = seen_codex_homes.get(str(home_path))
        if existing_home_id and existing_home_id != account_id:
            raise ValueError(
                f"Codex accounts '{existing_home_id}' and '{account_id}' point to the same CODEX_HOME '{home_path}'. "
                "Assign distinct 'home' directories in state/accounts.yaml."
            )
        seen_codex_homes[str(home_path)] = account_id
        if not account.get("profile"):
            account["profile"] = "weathervane_orchestrator"
        home_path.mkdir(parents=True, exist_ok=True)
        account["home"] = str(home_path)
    for account in data["claude"]:
        account_id = account.get("id") or "claude"
        slug = slugify(account_id)
        if not account.get("bin"):
            account["bin"] = "claude"
        env = account.get("env")
        if not isinstance(env, dict):
            env = {}
        if not env.get("CLAUDE_CONFIG_DIR"):
            env["CLAUDE_CONFIG_DIR"] = str(ACCOUNTS_ROOT / "claude" / slug)
        account["env"] = env
        Path(account["env"]["CLAUDE_CONFIG_DIR"]).mkdir(parents=True, exist_ok=True)
    return data


def load_config() -> Dict[str, List[Dict[str, Any]]]:
    if not CONFIG_PATH.exists():
        raise FileNotFoundError(
            f"Accounts configuration not found at {CONFIG_PATH}. "
            "Populate codex/claude accounts before running autopilot."
        )
    raw = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8")) or {}
    return normalize_config(raw)


def parse_iso(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        if ts.endswith("Z"):
            ts = ts[:-1] + "+00:00"
        return datetime.fromisoformat(ts)
    except ValueError:
        return None


def next_account(provider: str, purpose: str | None = None) -> Dict[str, Any]:
    config = load_config()
    accounts = config.get(provider, [])
    if not accounts:
        raise SystemExit(json.dumps({"error": "no_accounts_configured", "provider": provider}))

    runtime = ensure_runtime()
    runtime.setdefault(provider, {})

    now = utc_now()
    available: List[Dict[str, Any]] = []
    soonest_wait: float | None = None

    for account in accounts:
        account_id = account.get("id")
        if not account_id:
            continue

        entry = runtime[provider].setdefault(account_id, {})
        cooldown_until = parse_iso(entry.get("cooldown_until"))

        if cooldown_until and cooldown_until > now:
            wait_seconds = (cooldown_until - now).total_seconds()
            if soonest_wait is None or wait_seconds < soonest_wait:
                soonest_wait = wait_seconds
            continue

        available.append(account)

    if available:
        def sort_key(account: Dict[str, Any]) -> datetime:
            account_id = account.get("id")
            entry = runtime[provider].get(account_id, {}) if account_id else {}
            last_selected = parse_iso(entry.get("last_selected"))
            if last_selected is None:
                # Prioritise accounts that have never been selected.
                return datetime.min.replace(tzinfo=timezone.utc)
            return last_selected

        available.sort(key=sort_key)
        account = available[0]
        account_id = account.get("id")
        if account_id:
            entry = runtime[provider].setdefault(account_id, {})
            entry.pop("cooldown_until", None)
            entry["last_selected"] = now.isoformat()
            if purpose:
                entry["last_purpose"] = purpose
            write_runtime(runtime)
        payload = {
            "provider": provider,
            "account_id": account.get("id"),
            "profile": account.get("profile"),
            "home": account.get("home"),
            "email": account.get("email"),
            "label": account.get("label"),
            "bin": account.get("bin"),
            "env": account.get("env"),
        }
        print(json.dumps(payload))
        raise SystemExit(0)

    if soonest_wait is not None:
        print(json.dumps({"provider": provider, "wait_seconds": int(round(soonest_wait))}))
        raise SystemExit(2)

    print(json.dumps({"error": "no_accounts_available", "provider": provider}))
    raise SystemExit(3)


def record_cooldown(provider: str, account_id: str, cooldown_seconds: int, reason: str | None = None) -> None:
    runtime = ensure_runtime()
    runtime.setdefault(provider, {})
    entry = runtime[provider].setdefault(account_id, {})
    now = utc_now()
    delta = timedelta(seconds=max(cooldown_seconds, 0))
    entry["cooldown_until"] = (now + delta).isoformat()
    entry["last_cooldown_reason"] = reason or "usage_limit"
    write_runtime(runtime)


def clear_cooldown(provider: str, account_id: str) -> None:
    runtime = ensure_runtime()
    entry = runtime.setdefault(provider, {}).setdefault(account_id, {})
    entry.pop("cooldown_until", None)
    write_runtime(runtime)


def list_accounts(provider: str) -> None:
    config = load_config()
    accounts = config.get(provider, [])
    print(json.dumps(accounts))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    next_parser = sub.add_parser("next", help="Get the next available account")
    next_parser.add_argument("provider", choices=["codex", "claude"])
    next_parser.add_argument("--purpose", help="Optional purpose tag (e.g., evaluation, execution)")

    record_parser = sub.add_parser("record", help="Record a cooldown for an account")
    record_parser.add_argument("provider", choices=["codex", "claude"])
    record_parser.add_argument("account_id")
    record_parser.add_argument("cooldown_seconds", type=int)
    record_parser.add_argument("--reason", default="usage_limit")

    clear_parser = sub.add_parser("clear", help="Clear cooldown for an account")
    clear_parser.add_argument("provider", choices=["codex", "claude"])
    clear_parser.add_argument("account_id")

    list_parser = sub.add_parser("list", help="List known accounts")
    list_parser.add_argument("provider", choices=["codex", "claude"])

    args = parser.parse_args()

    if args.command == "next":
        next_account(args.provider, purpose=args.purpose)
    elif args.command == "record":
        record_cooldown(args.provider, args.account_id, args.cooldown_seconds, args.reason)
    elif args.command == "clear":
        clear_cooldown(args.provider, args.account_id)
    elif args.command == "list":
        list_accounts(args.provider)


if __name__ == "__main__":
    main()
