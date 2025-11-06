---
type: "directory_readme"
directory: "{{DIRECTORY_PATH}}"
status: "in-progress"
last_updated: "{{CURRENT_DATE}}"
owner: "WeatherVane Autopilot"
dependencies: []
consumers: []
---

# {{DIRECTORY_NAME}}

**Status:** In Progress
**Last Updated:** {{CURRENT_DATE}}
**Owner:** WeatherVane Autopilot

## Purpose

[TODO: Describe what this directory does in 1-2 sentences]

## Recent Changes

### {{TASK_ID}} - Initial setup
- Files: README.md
- Impact: low
- See: state/evidence/{{TASK_ID}}/

## Modules / Contents

[TODO: List subdirectories or key files with brief descriptions]

Example:
- `module_a.ts` - Core functionality
- `module_b.ts` - Helper utilities
- `tests/` - Test suite

## Integration Points

**Uses:** [TODO: List dependencies - what this directory imports/requires]

**Used by:** [TODO: List consumers - what imports/uses this directory]

Example:
- Uses: `../shared/utils.ts`, `../shared/types.ts`
- Used by: `../wave0/runner.ts`, `../../apps/api/main.ts`

## Navigation

- **Parent:** [../README.md](../README.md)
- **Children:** [TODO: Add subdirectories if any]
- **Neighbors:** [TODO: Add sibling directories if relevant]

## See Also

- [Related documentation in docs/]
- [Evidence bundles in state/evidence/]

---

⚠️ **AUTOMATION NOTICE**

This README is partially automated. Do not:
- Remove YAML frontmatter (breaks machine parsing)
- Delete required sections (breaks structure validation)
- Edit "Recent Changes" manually (use `scripts/readme_update.sh`)

Safe to edit:
- Purpose section (describe intent and strategy)
- Modules/Contents (list files and subdirectories)
- Integration Points (document dependencies and consumers)
- Navigation links (keep them current)
