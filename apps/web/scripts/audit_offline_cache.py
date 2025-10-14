#!/usr/bin/env python3
"""Audit the apps/web offline npm cache for required packages."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Dict, Iterable, Tuple


def load_dependencies(package_json: Path, include_dev: bool) -> Dict[str, str]:
    payload = json.loads(package_json.read_text())
    deps: Dict[str, str] = dict(payload.get("dependencies", {}))
    if include_dev:
        deps.update(payload.get("devDependencies", {}))
    return deps


def build_spec(package: str, version: str) -> str:
    return f"{package}@{version}"


def run_cache_ls(cache_dir: Path, spec: str) -> Tuple[bool, str]:
    process = subprocess.run(
        ["npm", "cache", "ls", "--cache", str(cache_dir), spec],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    output = process.stdout.strip()
    has_tarball = any(".tgz" in line for line in output.splitlines())
    return has_tarball, output or process.stderr.strip()


def audit(cache_dir: Path, specs: Iterable[str]) -> Tuple[list[str], list[str]]:
    ok: list[str] = []
    missing: list[str] = []
    for spec in specs:
        present, output = run_cache_ls(cache_dir, spec)
        if present:
            ok.append(spec)
        else:
            missing.append(spec)
    return ok, missing


def main(argv: list[str]) -> int:
    script_dir = Path(__file__).resolve().parent
    app_dir = script_dir.parent
    default_cache = app_dir / "offline-cache"
    parser = argparse.ArgumentParser(
        description="Verify that the offline npm cache contains every dependency required by apps/web.",
    )
    parser.add_argument(
        "--cache",
        type=Path,
        default=default_cache,
        help="Path to the npm cache directory (defaults to apps/web/offline-cache).",
    )
    parser.add_argument(
        "--no-dev",
        action="store_true",
        help="Skip devDependencies during the audit.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit a JSON summary instead of human-readable text.",
    )
    parser.add_argument(
        "--write-missing",
        type=Path,
        help="Write missing package specs to the given file (one per line).",
    )
    args = parser.parse_args(argv)

    package_json = app_dir / "package.json"
    if not package_json.exists():
        raise SystemExit(f"package.json not found at {package_json}")

    if not args.cache.exists():
        raise SystemExit(f"npm cache directory not found at {args.cache}")

    deps = load_dependencies(package_json, include_dev=not args.no_dev)
    if not deps:
        print("package.json contains no dependencies to audit.", file=sys.stderr)
        return 0

    specs = sorted(build_spec(pkg, version) for pkg, version in deps.items())
    ok, missing = audit(args.cache, specs)

    summary = {
        "cache_directory": str(args.cache),
        "dependencies_checked": len(specs),
        "present": ok,
        "missing": missing,
    }

    if args.write_missing:
        args.write_missing.parent.mkdir(parents=True, exist_ok=True)
        args.write_missing.write_text("\n".join(missing) + ("\n" if missing else ""))

    if args.json:
        json.dump(summary, sys.stdout, indent=2)
        sys.stdout.write("\n")
    else:
        print("Offline cache audit")
        print("===================")
        print(f"Cache directory: {args.cache}")
        print(f"Dependencies checked: {len(specs)}")
        print(f"Available: {len(ok)}")
        print(f"Missing: {len(missing)}")
        print()

        if ok:
            print("Present packages:")
            for spec in ok:
                print(f"  ✔ {spec}")
            print()

        if missing:
            print("Missing packages:")
            for spec in missing:
                print(f"  ✖ {spec}")
            print()
            print("Populate the cache by running on a networked machine:")
            for spec in missing:
                print(f"  npm cache add {spec} --cache \"{args.cache}\"")
        else:
            print("Offline cache contains every requested package.")

    return 0 if not missing else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
