#!/usr/bin/env python3
"""
Ensure the Codex CLI config contains the WeatherVane profile with the desired defaults.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def ensure_profile_block(
    contents: str,
    profile: str,
    workspace: Path,
    instructions: Path,
    model: str,
    sandbox: str,
    approval: str,
    reasoning: str,
    include_plan: bool,
) -> str:
    block_lines = [
        f"[profiles.{profile}]",
        f"base_instructions = {json.dumps(str(instructions))}",
        f"model = {json.dumps(model)}",
        f"sandbox = {json.dumps(sandbox)}",
        f"approval = {json.dumps(approval)}",
        f"reasoning = {json.dumps(reasoning)}",
        f"include_plan_tool = {'true' if include_plan else 'false'}",
        f"cwd = {json.dumps(str(workspace))}",
        "",
    ]
    marker = f"[profiles.{profile}]"

    lines = contents.splitlines()
    preamble: list[str] = []
    sections: list[tuple[str, list[str]]] = []
    current_header: str | None = None
    current_body: list[str] = []

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("[") and stripped != "":
            if current_header is not None:
                sections.append((current_header, current_body))
            current_header = stripped
            current_body = [line]
        else:
            if current_header is None:
                preamble.append(line)
            else:
                current_body.append(line)

    if current_header is not None:
        sections.append((current_header, current_body))

    stray_keys = {"base_instructions", "model", "sandbox", "approval", "reasoning", "include_plan_tool", "cwd"}
    filtered_preamble: list[str] = []
    for line in preamble:
        stripped = line.strip()
        if "=" in stripped:
            key = stripped.split("=", 1)[0].strip()
            if key in stray_keys:
                continue
        if stripped:
            filtered_preamble.append(line)

    new_sections: list[tuple[str, list[str]]] = []
    replaced = False
    for header, body in sections:
        if header == marker:
            new_sections.append((marker, block_lines.copy()))
            replaced = True
        else:
            new_sections.append((header, body.copy()))

    if not replaced:
        new_sections.append((marker, block_lines.copy()))

    parts: list[str] = []
    preamble_text = "\n".join(filtered_preamble).strip()
    if preamble_text:
        parts.append(preamble_text)
    for header, body in new_sections:
        section_text = "\n".join(body).strip()
        if section_text:
            parts.append(section_text)

    output = "\n\n".join(parts)
    if output and not output.endswith("\n"):
        output += "\n"
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config_path")
    parser.add_argument("profile_name")
    parser.add_argument("workspace")
    parser.add_argument("instructions_path")
    parser.add_argument("--model", default="gpt-5-codex")
    parser.add_argument("--sandbox", default="danger-full-access")
    parser.add_argument("--approval", default="never")
    parser.add_argument("--reasoning", default="auto")
    parser.add_argument("--no-plan-tool", action="store_false", dest="include_plan_tool", default=True)

    args = parser.parse_args()

    config_path = Path(args.config_path).expanduser()
    workspace = Path(args.workspace).resolve()
    instructions = Path(args.instructions_path).resolve()

    if not instructions.exists():
        raise SystemExit(f"Base instructions file not found: {instructions}")

    config_path.parent.mkdir(parents=True, exist_ok=True)

    existing = ""
    if config_path.exists():
        existing = config_path.read_text(encoding="utf-8")

    updated = ensure_profile_block(
        existing,
        args.profile_name,
        workspace,
        instructions,
        args.model,
        args.sandbox,
        args.approval,
        args.reasoning,
        args.include_plan_tool,
    )

    if updated != existing:
        config_path.write_text(updated, encoding="utf-8")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
