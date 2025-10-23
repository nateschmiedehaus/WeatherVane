#!/usr/bin/env python3
"""
Repository security checks executed by `make security`.

The audit currently focuses on preventing high-risk credentials from slipping into
source control and flagging obvious secret files. The checks balance fidelity with
fast feedback so the critic can run during every Autopilot cycle.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator, List, Sequence


@dataclass(frozen=True)
class SecretPattern:
    """Metadata describing a token/signature we should never store in git."""

    name: str
    description: str
    regex: re.Pattern[str]


@dataclass(frozen=True)
class Finding:
    """A potential secret match captured during the scan."""

    pattern: SecretPattern
    path: Path
    line_number: int
    excerpt: str


SECRET_PATTERNS: Sequence[SecretPattern] = (
    SecretPattern(
        name="aws_access_key",
        description="AWS access keys begin with AKIA and are 20 characters long.",
        regex=re.compile(r"AKIA[0-9A-Z]{16}"),
    ),
    SecretPattern(
        name="aws_secret_key",
        description="AWS secret keys often accompany aws_secret_access_key assignments.",
        regex=re.compile(r"(?i)aws[_\-]?secret[_\-]?access[_\-]?key\s*[:=]\s*['\"]?[A-Za-z0-9/+=]{40}"),
    ),
    SecretPattern(
        name="github_token",
        description="GitHub personal access tokens start with gh[pousr]_ prefixes.",
        regex=re.compile(r"gh[pousr]_[A-Za-z0-9]{36,}"),
    ),
    SecretPattern(
        name="google_api_key",
        description="Google API keys start with AIza and are 39 characters long.",
        regex=re.compile(r"AIza[0-9A-Za-z\-_]{35}"),
    ),
    SecretPattern(
        name="slack_token",
        description="Slack tokens begin with xox followed by role identifier.",
        regex=re.compile(r"xox[baprs]-[0-9A-Za-z\-]{10,}"),
    ),
    SecretPattern(
        name="private_key_block",
        description="Private key PEM headers should never live in the repo.",
        regex=re.compile(r"-----BEGIN (?:RSA|DSA|EC|OPENSSH) PRIVATE KEY-----"),
    ),
)

BLOCKLISTED_FILENAMES: Sequence[str] = (
    ".env",
    ".env.local",
    ".env.production",
    "auth.json",
    "secrets.json",
    "credentials.json",
)

IGNORE_PREFIXES: Sequence[str] = (
    ".accounts/",
    ".codex/",
    "apps/web/offline-cache/",
)

IGNORE_FILES: Sequence[str] = (
    "state/security/credentials.json",
)

MAX_SCAN_BYTES = 1_000_000  # Skip unusually large assets (≈1 MB) to avoid slow scans.
TEXT_SAFE_EXTENSIONS = {
    ".json",
    ".js",
    ".mjs",
    ".ts",
    ".tsx",
    ".py",
    ".md",
    ".txt",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".cfg",
    ".sql",
    ".sh",
    ".bash",
    ".env.example",
}


def discover_tracked_files(root: Path) -> List[Path]:
    """Return git-tracked files for the repository rooted at `root`."""

    try:
        completed = subprocess.run(
            ["git", "ls-files"],
            cwd=root,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        raise RuntimeError(f"Unable to enumerate tracked files: {error}") from error

    files: List[Path] = []
    for line in completed.stdout.splitlines():
        candidate = line.strip()
        if not candidate:
            continue
        if candidate in IGNORE_FILES:
            continue
        if any(candidate.startswith(prefix) for prefix in IGNORE_PREFIXES):
            continue
        files.append(root / candidate)
    return files


def should_scan(path: Path) -> bool:
    """Return True when the file is a reasonable text candidate for scanning."""

    if not path.is_file():
        return False
    try:
        size = path.stat().st_size
    except OSError:
        return False
    if size > MAX_SCAN_BYTES:
        return False

    extension = path.suffix.lower()
    if extension in TEXT_SAFE_EXTENSIONS:
        return True
    binary_extensions = {".ico", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".woff", ".woff2"}
    if extension in binary_extensions:
        return False

    try:
        with path.open("rb") as handle:
            sample = handle.read(512)
    except OSError:
        return False

    if b"\x00" in sample:
        return False

    return True


def iter_lines(path: Path) -> Iterator[tuple[int, str]]:
    """Yield (line_number, line_text) pairs with newline stripped."""

    try:
        with path.open("r", encoding="utf-8", errors="ignore") as handle:
            for index, raw_line in enumerate(handle, start=1):
                yield index, raw_line.rstrip("\n")
    except OSError:
        return


def scan_file(path: Path, patterns: Sequence[SecretPattern]) -> List[Finding]:
    """Scan a single file for secret signatures."""

    matches: List[Finding] = []
    for line_number, line in iter_lines(path):
        for pattern in patterns:
            if pattern.regex.search(line):
                excerpt = line.strip()
                if len(excerpt) > 160:
                    excerpt = f"{excerpt[:157]}..."
                matches.append(
                    Finding(
                        pattern=pattern,
                        path=path,
                        line_number=line_number,
                        excerpt=excerpt,
                    )
                )
    return matches


def detect_blocklisted_files(files: Iterable[Path], root: Path) -> List[Path]:
    """Return files whose names indicate potential credential dumps."""

    flagged: List[Path] = []
    lower_blocklist = {name.lower() for name in BLOCKLISTED_FILENAMES}
    for file_path in files:
        try:
            relative = file_path.relative_to(root).as_posix()
        except ValueError:
            relative = file_path.as_posix()
        if any(relative.startswith(prefix) for prefix in IGNORE_PREFIXES):
            continue
        if relative in IGNORE_FILES:
            continue
        if file_path.name.lower() in lower_blocklist:
            flagged.append(file_path)
    return flagged


def run_security_audit(root: Path) -> tuple[List[Finding], List[Path]]:
    """Execute the full security audit and return detected secrets and blocklisted files."""

    tracked_files = discover_tracked_files(root)
    blocklisted = detect_blocklisted_files(tracked_files, root)

    findings: List[Finding] = []
    for file_path in tracked_files:
        if not should_scan(file_path):
            continue
        findings.extend(scan_file(file_path, SECRET_PATTERNS))
    return findings, blocklisted


def print_results(findings: Sequence[Finding], blocklisted: Sequence[Path]) -> None:
    """Pretty-print audit findings."""

    if findings:
        print("Potential credentials detected:")
        for finding in findings:
            rel = finding.path
            try:
                rel = finding.path.relative_to(Path.cwd())
            except ValueError:
                pass
            print(
                f"- {finding.pattern.name} ({finding.pattern.description}) "
                f"at {rel}:{finding.line_number}\n  {finding.excerpt}"
            )

    if blocklisted:
        print("\nSecret-like files tracked in git:")
        for flagged in blocklisted:
            rel = flagged
            try:
                rel = flagged.relative_to(Path.cwd())
            except ValueError:
                pass
            print(f"- {rel}")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run WeatherVane security checks.")
    parser.add_argument(
        "--root",
        type=Path,
        default=Path.cwd(),
        help="Repository root (defaults to current working directory).",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output findings as JSON for tooling integrations.",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)

    try:
        findings, blocklisted = run_security_audit(args.root)
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        return 2

    if args.json:
        payload = {
            "findings": [
                {
                    "pattern": finding.pattern.name,
                    "path": str(finding.path),
                    "line": finding.line_number,
                    "excerpt": finding.excerpt,
                }
                for finding in findings
            ],
            "blocklisted": [str(path) for path in blocklisted],
        }
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        if not findings and not blocklisted:
            print("Security audit complete. No secrets detected.")
        print_results(findings, blocklisted)

    if findings or blocklisted:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
