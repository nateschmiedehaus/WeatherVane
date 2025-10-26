# Legacy Autopilot Scripts

These Bash helpers powered the pre-unified Autopilot (autopilot.sh, docker wrappers, tmux harness, etc.).
They now live here for historical reference only. The supported entry point is:

```
make autopilot        # wraps tools/wvo_mcp/scripts/autopilot_unified.sh
```

If you need to inspect or port behavior, read the archived files from this directory and migrate the
missing capability into the TypeScript orchestrator instead of re-running the old scripts.
