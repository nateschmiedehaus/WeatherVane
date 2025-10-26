# Autopilot Critical Issue #5: Runaway Output (73MB Context)

**Date:** 2025-10-17T23:25Z
**Severity:** CRITICAL - Breaks autopilot completely

## Problem

The autopilot generated a **73MB context** which exceeded the API limit of 10MB, causing complete failure:

```
Invalid 'input[793].content[0].text': string too long.
Expected maximum length 10485760 (10MB),
but got length 73072686 (73MB) instead.
```

## Root Cause

The autopilot used bash commands that output massive amounts of text:

```bash
bash -lc "sed -n '1,260p' apps/api/services/plan_service.py"
```

Then the output kept accumulating across tool calls, eventually exceeding 73MB when it likely hit a package.json or node_modules listing.

**Key Issues:**
1. No output limits on bash commands
2. Used `sed` on entire files instead of targeted line ranges
3. No conversation size monitoring
4. Probably ran `npm list` or similar which dumps megabytes of package info

## Impact

- API rejects requests with "400 Bad Request"
- Autopilot crashes completely
- All progress lost
- Process becomes unkillable (Issue #4)

## Fix Applied

### Autopilot Prompt (autopilot.sh lines 3804-3813)

**Added strict output limits:**
```bash
**OUTPUT LIMITS:** Never output >1000 lines. Use head/tail.
Read files with line ranges only. Total conversation must stay <5MB
to avoid "string too long" API errors.
```

**Specific restrictions:**
- No `cat` on large files
- No `sed` without `head`/`tail`
- No `npm list` or package dumps
- fs_read must use line ranges (offset/limit)
- Keep each tool call <100 lines
- Use `git diff --stat` NOT full diff

### Master Prompt (wvo_prompt.md line 20)

```markdown
**OUTPUT LIMITS (CRITICAL)**: Never output more than 1000 lines in a single tool call.
Use `head -100`, `tail -100`, or read specific line ranges (offset/limit).
Never run `cat`, `npm list`, or bash commands that dump entire files.
If a file is >100 lines, use fs_read with line ranges.
Violating this will crash the API with "string too long" errors (73MB+ contexts).
Keep total conversation under 5MB.
```

## Prevention

1. **Always use limits:**
   - `head -100` for file previews
   - `fs_read` with offset/limit for large files
   - `git diff --stat` instead of full diffs

2. **Never run:**
   - `cat` on unknown files
   - `npm list` or `npm ls`
   - `sed` without output limits
   - Commands that could output >1000 lines

3. **Monitor conversation size:**
   - Keep responses under 200 words
   - Use `minimal=true` for all MCP tools
   - Trim context regularly

## Verification Needed

- Test autopilot with output monitoring
- Add telemetry for conversation size
- Implement automatic context trimming when >3MB

---

**Status:** Fixed in prompt, needs runtime enforcement
**Priority:** P0 - Blocks all autopilot runs
**Files Modified:**
- `tools/wvo_mcp/scripts/autopilot.sh`
- `docs/wvo_prompt.md`
