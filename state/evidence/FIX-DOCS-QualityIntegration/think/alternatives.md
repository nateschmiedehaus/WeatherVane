# THINK — Alternatives

| Option | Description | Pros | Cons | Decision |
| --- | --- | --- | --- | --- |
| A | Inline all troubleshooting content inside CLAUDE.md and README.md (no new file) | Fewer files to maintain | Creates duplication, bloats primary docs, harder to link from other guides | ❌ |
| B | Create standalone troubleshooting guide, link from primary docs | Centralises operational knowledge, easier to update, keeps core docs concise | Requires keeping links in sync | ✅ |
| C | Auto-generate documentation from code comments/scripts | Prevents drift long term | Significant tooling effort, out-of-scope for current roadmap slice | ❌ |

We adopt **Option B**: a dedicated troubleshooting guide referenced by CLAUDE.md, WORK_PROCESS.md, and README. This balances maintainability with scope and aligns with roadmap exit criteria requiring explicit troubleshooting documentation.
