# State Persistence Strategy

## 🎯 Goal

Enable **seamless continuation across sessions** without overwhelming any instance with excessive context.

## Problem Statement

Traditional approaches fail because they either:
- ❌ Dump entire state into context (100s of KB)
- ❌ Lose all context between sessions
- ❌ Require manual state reconstruction
- ❌ Overwhelm new model instances with history

## ✅ Our Solution

**Compact, Smart Checkpoints**

- 💾 **Under 50KB per checkpoint**
- 📊 **Summary data only** (not full dumps)
- 🔄 **Automatic saving** after significant operations
- 📈 **Progressive loading** (show summary first, details on demand)
- 🧹 **Self-pruning** (removes old/unnecessary data)

---

## Architecture

### State Files

```
state/
├── checkpoint_compact.json     # < 50KB - Latest compact checkpoint
├── roadmap.yaml                # Full roadmap (loaded on demand)
├── context.md                  # < 1000 words - Current context
└── critics/                    # Critic outputs (pruned regularly)
    ├── build.json
    ├── tests.json
    └── ...
```

### Checkpoint Structure

```json
{
  "version": "1.0",
  "timestamp": "2025-10-09T21:30:00Z",
  "session_id": "session_1728507000_abc123",

  "roadmap_summary": {
    "total_tasks": 25,
    "completed_tasks": 18,
    "in_progress_tasks": 2,
    "pending_tasks": 5,
    "completion_percentage": 72,
    "current_phase": "shipping",
    "next_tasks": ["T1.1.1", "T1.1.2", "T1.1.3"]
  },

  "recent_activity": {
    "last_completed_task": "T1.0.5",
    "last_updated": "2025-10-09T21:25:00Z",
    "tasks_completed_this_session": 3,
    "deployments_this_session": 1
  },

  "provider_state": {
    "current_provider": "claude_code",
    "token_usage_summary": {
      "codex_percent_used": 45,
      "claude_code_percent_used": 62
    }
  },

  "context_summary": {
    "word_count": 850,
    "sections": ["Current Focus", "Decisions", "Blockers"],
    "key_decisions": [
      "Using Polars for data processing",
      "Deploying to staging first",
      "Prioritizing shipping velocity"
    ],
    "blockers": []
  },

  "continuation_hint": "Resume work: 5 pending tasks in shipping phase"
}
```

**Key Points:**
- ✅ **Task IDs only** (not full task objects)
- ✅ **Counts & percentages** (not lists)
- ✅ **Last 3-5 items** (not full history)
- ✅ **Aggregated metrics** (not raw data)

---

## Persistence Flow

### On Startup (Lightweight)

```
1. Load compact checkpoint (< 50KB)
2. Parse summary data
3. Show quick orientation
4. Full state loaded on-demand only
```

**Example:**
```javascript
// Server boots
const checkpoint = await contextManager.loadCompactCheckpoint();

// Shows immediately:
"Last Session (2 hours ago):
- Progress: 72% complete (18/25 tasks)
- Phase: shipping
- Provider: claude_code
- Recent: 3 tasks completed, 1 deployment

Next: Resume work: 5 pending tasks in shipping phase"
```

### During Operation (Automatic)

Checkpoint saved automatically:
- ✅ After completing task
- ✅ After roadmap extension
- ✅ Before long operations
- ✅ On tool call: `state_save`

### On Session End

Checkpoint persists to disk:
- ✅ Available for next session
- ✅ Works across different models
- ✅ Survives server restarts

---

## Tools

### `state_save` - Save Checkpoint

**Purpose**: Create compact checkpoint

**Parameters**: None

**Output**:
```json
{
  "size": "< 50KB",
  "completion": "72%",
  "persists_across": [
    "new chats",
    "different models",
    "restarts"
  ]
}
```

**When to use**:
- Session boundaries
- Before switching contexts
- After major milestones
- Periodically (every 5-10 tasks)

### `state_metrics` - Check State Health

**Purpose**: Monitor state size and health

**Parameters**: None

**Output**:
```json
{
  "checkpoint_size_kb": 45,
  "roadmap_size_kb": 85,
  "context_size_kb": 12,
  "total_size_kb": 142,
  "is_bloated": false,
  "needs_pruning": false,
  "health": "✅ Healthy",
  "recommendation": "No action needed"
}
```

**Warning Thresholds**:
- ⚠️  Total > 200KB: Bloated
- ⚠️  Context > 100KB: Needs pruning
- ⚠️  Roadmap > 150KB: Needs pruning

### `state_prune` - Clean Old Data

**Purpose**: Remove unnecessary data

**Parameters**: None

**Removes**:
- Old checkpoint formats
- Archived completed tasks
- Excessive history
- Stale critic outputs

**Keeps**:
- Latest checkpoint
- Active/pending tasks
- Recent decisions (last 5)
- Current context

**Output**:
```json
{
  "files_removed": 3,
  "size_reduction_kb": 125,
  "new_metrics": {
    "total_size_kb": 85,
    "health": "✅ Healthy"
  }
}
```

### `prompt_budget_check` - Validate prompt + checkpoint budget

**Purpose**: Ensure prompts stay under 600 tokens and checkpoints/context remain compact

**When to run**:
- Before long autonomous loops
- After large roadmap/context updates
- During CI to guard prompt regressions

**Command**:
```bash
node tools/wvo_mcp/scripts/check_prompt_budget.mjs
```

**Output**:
```
✅ Prompt budget check passed. Context words: 420 Checkpoint size: 34.8KB Prompts checked: 3 Max prompt tokens: 482
```

Fails with actionable guidance when context exceeds 1000 words, checkpoints grow past 50KB, or sampled prompts cross the 600-token budget.

---

## Continuation Workflow

### New Chat Session

```javascript
// 1. Server loads checkpoint
const checkpoint = await contextManager.loadCompactCheckpoint();

// 2. Show summary
await use_tool("wvo_status")
// Returns:
// "Last Session (2 hours ago):
//  - Progress: 72% complete
//  - Phase: shipping
//  - Next: Resume work: 5 pending tasks"

// 3. Get current tasks
await use_tool("plan_next", { limit: 5 })
// Returns current tasks from roadmap

// 4. Continue work
await use_tool("plan_update", {
  task_id: "T1.1.1",
  status: "in_progress"
})
```

### Different Model

Same workflow works because:
- ✅ State is on disk (not in context)
- ✅ Checkpoint is model-agnostic
- ✅ Summary shown first (orient quickly)
- ✅ Full details loaded on demand

### Long Sessions

```javascript
// Check state health periodically
await use_tool("state_metrics")

// If bloated:
await use_tool("state_prune")

// Save checkpoint
await use_tool("state_save")
```

---

## Size Management

### Context Budget

**Target: < 200KB total state**

Breakdown:
- Checkpoint: < 50KB (25%)
- Roadmap: < 100KB (50%)
- Context: < 50KB (25%)
- Critics: Pruned regularly

### Pruning Strategy

**Automatic Triggers:**
1. State > 200KB total
2. Context > 100KB
3. Roadmap > 150KB

**Pruning Actions:**
1. Remove old checkpoints
2. Archive completed tasks (>30 days)
3. Trim context to last 1000 words
4. Keep only recent critic outputs (last 7 days)

### Checkpoint Rotation

```
checkpoint_compact.json       # Current
checkpoint_compact_old.json   # Previous (kept for 24h)
checkpoint_compact_*.json     # Archived (pruned)
```

---

## Best Practices

### For Autonomous Agents

1. ✅ **Call `state_save` every 5-10 tasks**
2. ✅ **Check `state_metrics` hourly**
3. ✅ **Prune when `needs_pruning: true`**
4. ✅ **Load checkpoint on startup**
5. ✅ **Use summary for orientation**

### For Human Operators

1. ✅ **Check `wvo_status` to see last session**
2. ✅ **Trust the checkpoint system**
3. ✅ **Prune if state feels slow**
4. ✅ **Save before long breaks**
5. ✅ **Review metrics periodically**

---

## Anti-Patterns to Avoid

❌ **Dumping full roadmap into context**
- Use summary with task IDs instead

❌ **Loading entire history on startup**
- Load summary first, details on-demand

❌ **Never pruning old data**
- Automate pruning with triggers

❌ **Saving every operation**
- Save after significant milestones only

❌ **Ignoring size metrics**
- Monitor and act on warnings

---

## Examples

### Scenario 1: New Chat After Hours

**Before:**
```
[Previous session ended 4 hours ago]
```

**Startup:**
```javascript
// Server loads checkpoint
const checkpoint = loadCompactCheckpoint();

// Shows:
"Last Session (4 hours ago):
- Progress: 68% complete (17/25 tasks)
- Phase: development
- Provider: claude_code (62% capacity)
- Recent: 2 tasks completed, 0 deployments

Next: Resume work: 8 pending tasks in development phase"
```

**Agent Response:**
"I see from the last session we completed 17/25 tasks. Let me get the current pending tasks and continue where we left off."

### Scenario 2: Switching Models

**Claude 3.5 Sonnet → Claude 3 Opus**

```javascript
// Same checkpoint file
// Different model loads it

// Opus sees:
"Last Session (30 minutes ago):
- Progress: 72% complete
- Provider: claude_code (now at 58% capacity)

Next: 5 pending tasks ready"

// Continues seamlessly
```

### Scenario 3: State Getting Large

**Check Metrics:**
```javascript
await use_tool("state_metrics")

// Returns:
{
  "total_size_kb": 245,
  "is_bloated": true,
  "needs_pruning": true,
  "health": "⚠️  Bloated"
}
```

**Prune:**
```javascript
await use_tool("state_prune")

// Returns:
{
  "files_removed": 5,
  "size_reduction_kb": 158,
  "total_size_kb": 87,
  "health": "✅ Healthy"
}
```

---

## Technical Details

### File Operations

**Read Operations** (Fast):
- Checkpoint: JSON parse (< 50KB)
- Summary: String format (< 1KB)

**Write Operations** (Async):
- Checkpoint: JSON stringify + writeFile
- Size check: Warn if > 50KB

**Prune Operations** (Batch):
- Identify old files
- Remove in batch
- Verify size reduction

### Error Handling

**Missing Checkpoint**:
```javascript
if (!checkpoint) {
  return "No previous session. Starting fresh.";
}
```

**Corrupted Checkpoint**:
```javascript
try {
  JSON.parse(checkpointStr);
} catch {
  logWarning("Corrupted checkpoint, starting fresh");
  return null;
}
```

**Write Failures**:
```javascript
try {
  writeFileSync(checkpointPath, data);
} catch (error) {
  logWarning("Checkpoint save failed", { error });
  // Continue without checkpoint
}
```

---

## Success Metrics

The persistence system is working well when:

✅ **Checkpoint < 50KB**: Compact and efficient
✅ **Total state < 200KB**: Not bloated
✅ **Load time < 100ms**: Fast startup
✅ **Continuation seamless**: No context loss
✅ **Multiple sessions work**: Persistent across restarts

---

## Future Enhancements

Potential improvements:
- Compression (gzip checkpoints)
- Incremental updates (only changed data)
- Multiple checkpoint slots (A/B switching)
- Cloud backup (optional)
- Automatic archiving (long-term storage)

---

## Summary

**The system ensures**:
- 💾 **Compact checkpoints** (< 50KB)
- 🔄 **Seamless continuation** across sessions
- 📊 **Summary-first loading** (fast orientation)
- 🧹 **Self-pruning** (automatic cleanup)
- ✅ **No context overload** (never overwhelm instances)

**Result**: State persists intelligently without overwhelming any chat session or model instance! 🚀
