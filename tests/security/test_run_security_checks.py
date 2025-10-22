from pathlib import Path

import pytest

from tools.security.run_security_checks import (
    SECRET_PATTERNS,
    detect_blocklisted_files,
    scan_file,
    should_scan,
)


def test_scan_file_detects_github_token(tmp_path: Path) -> None:
    sample = tmp_path / "sample.txt"
    sample.write_text("This is a token ghp_0123456789abcdef0123456789abcdef0123\n")

    findings = scan_file(sample, SECRET_PATTERNS)

    assert findings, "Expected GitHub token pattern to be detected."
    assert findings[0].pattern.name == "github_token"
    assert findings[0].line_number == 1


def test_detect_blocklisted_files_flags_env(tmp_path: Path) -> None:
    tracked = [tmp_path / ".env", tmp_path / "config/settings.py"]
    for path in tracked:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("placeholder")

    flagged = detect_blocklisted_files(tracked, tmp_path)

    assert flagged == [tmp_path / ".env"]


@pytest.mark.parametrize(
    ("filename", "expected"),
    [
        ("notes.txt", True),
        ("picture.png", False),
        ("blob.bin", False),
    ],
)
def test_should_scan_filters_binaries(tmp_path: Path, filename: str, expected: bool) -> None:
    target = tmp_path / filename
    target.write_bytes(b"\x00" * 100 if filename.endswith(".bin") else b"text")

    assert should_scan(target) is expected
