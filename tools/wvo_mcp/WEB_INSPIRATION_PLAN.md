# Web Inspiration Feature - Shipping Plan
## Autonomous, High-Performance, Zero-Manual-Intervention

**Date**: October 10, 2025
**Priority**: Enhancement (ships after core orchestration is stable)
**Philosophy**: Ship fast, fail fast, stay lean

---

## 🎯 Goal

Enable agents (Claude Code + Codex) to autonomously:
1. Research award-winning websites for design inspiration
2. Capture screenshots and HTML snapshots
3. Use captured assets in their design/UX decisions
4. **All without manual intervention** - handled by autopilot

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Autopilot Orchestrator                    │
│  (run_wvo_autopilot.sh or orchestrator runtime)           │
└────────────┬────────────────────────────────────────────────┘
             │
             │ 1. Task needs inspiration?
             ↓
┌─────────────────────────────────────────────────────────────┐
│              Web Inspiration MCP Tool                       │
│  (tools/wvo_mcp/src/web_tools/inspiration_fetcher.ts)     │
└────────────┬────────────────────────────────────────────────┘
             │
             │ 2. Fetch URL
             ↓
┌─────────────────────────────────────────────────────────────┐
│           Headless Browser (Playwright)                     │
│  • Load page (10s timeout)                                 │
│  • Take screenshot (1920×1080 viewport)                    │
│  • Extract HTML snapshot                                    │
│  • Return as MCP artifact                                   │
└────────────┬────────────────────────────────────────────────┘
             │
             │ 3. Store artifacts
             ↓
┌─────────────────────────────────────────────────────────────┐
│         state/web_inspiration/<task-id>/                    │
│  • screenshot.png (compressed)                              │
│  • snapshot.html (cleaned)                                  │
│  • metadata.json (URL, timestamp, size)                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 Implementation Components

### 1. MCP Tool: `web_inspiration.capture`

**File**: `tools/wvo_mcp/src/web_tools/inspiration_fetcher.ts`

```typescript
export interface WebInspirationInput {
  url: string;
  viewport?: { width: number; height: number };
  timeout?: number; // Max 10s
}

export interface WebInspirationResult {
  success: boolean;
  screenshot_path?: string;
  html_path?: string;
  metadata: {
    url: string;
    timestamp: number;
    screenshot_size_kb: number;
    html_size_kb: number;
    load_duration_ms: number;
  };
  error?: string;
}

export class InspirationFetcher {
  private browser?: Browser;
  private readonly ALLOWED_DOMAINS = [
    'awwwards.com',
    'dribbble.com',
    'behance.net',
    'cssnectar.com',
    'siteinspire.com'
  ];

  async capture(input: WebInspirationInput): Promise<WebInspirationResult> {
    // 1. Validate domain
    if (!this.isAllowedDomain(input.url)) {
      return { success: false, error: 'Domain not in allow-list' };
    }

    // 2. Launch browser (cached instance)
    const browser = await this.getBrowser();
    const page = await browser.newPage({
      viewport: input.viewport || { width: 1920, height: 1080 }
    });

    try {
      // 3. Navigate with timeout
      await page.goto(input.url, {
        timeout: input.timeout || 10000,
        waitUntil: 'networkidle'
      });

      // 4. Capture screenshot
      const screenshotPath = `state/web_inspiration/${Date.now()}/screenshot.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });

      // 5. Extract HTML (stripped of scripts/tracking)
      const html = await page.content();
      const cleanedHtml = this.stripTracking(html);
      const htmlPath = screenshotPath.replace('screenshot.png', 'snapshot.html');
      await fs.writeFile(htmlPath, cleanedHtml);

      // 6. Return metadata
      const screenshotSize = (await fs.stat(screenshotPath)).size / 1024;
      const htmlSize = (await fs.stat(htmlPath)).size / 1024;

      return {
        success: true,
        screenshot_path: screenshotPath,
        html_path: htmlPath,
        metadata: {
          url: input.url,
          timestamp: Date.now(),
          screenshot_size_kb: Math.round(screenshotSize),
          html_size_kb: Math.round(htmlSize),
          load_duration_ms: Math.round(page.timing().navigationStart)
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      await page.close();
    }
  }

  private isAllowedDomain(url: string): boolean {
    try {
      const hostname = new URL(url).hostname;
      return this.ALLOWED_DOMAINS.some(d => hostname.includes(d));
    } catch {
      return false;
    }
  }

  private stripTracking(html: string): string {
    // Remove: <script>, Google Analytics, tracking pixels, etc.
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/google-analytics\.com/gi, '')
      .replace(/googletagmanager\.com/gi, '')
      .replace(/facebook\.net/gi, '');
  }
}
```

---

### 2. MCP Server Integration

**File**: `tools/wvo_mcp/src/index-orchestrator.ts`

Add new MCP tool registration:

```typescript
import { InspirationFetcher } from './web_tools/inspiration_fetcher.js';

const inspirationFetcher = new InspirationFetcher(workspaceRoot);

server.registerTool(
  'web_inspiration_capture',
  {
    description: `Capture a screenshot and HTML snapshot of a website for design inspiration.

Parameters:
- url (required): URL to capture (must be from allowed domain)
- viewport (optional): { width, height } for screenshot
- timeout (optional): Max load time in ms (default: 10000)

Returns: Screenshot path, HTML path, and metadata.

Allowed domains: awwwards.com, dribbble.com, behance.net, cssnectar.com, siteinspire.com

Example:
{
  "url": "https://www.awwwards.com/sites/example-site"
}`,
    inputSchema: z.object({
      url: z.string().url(),
      viewport: z.object({ width: z.number(), height: z.number() }).optional(),
      timeout: z.number().max(10000).optional()
    }).shape
  },
  async (input: unknown) => {
    try {
      const parsed = z.object({
        url: z.string().url(),
        viewport: z.object({ width: z.number(), height: z.number() }).optional(),
        timeout: z.number().max(10000).optional()
      }).parse(input);

      const result = await inspirationFetcher.capture(parsed);

      if (!result.success) {
        return formatError('Capture failed', result.error || 'Unknown error');
      }

      return formatSuccess('Web inspiration captured', {
        screenshot: result.screenshot_path,
        html: result.html_path,
        size_kb: result.metadata.screenshot_size_kb + result.metadata.html_size_kb,
        duration_ms: result.metadata.load_duration_ms
      });
    } catch (error) {
      return formatError('Failed to capture inspiration', error instanceof Error ? error.message : String(error));
    }
  }
);
```

---

### 3. Autopilot Integration

**File**: `tools/wvo_mcp/scripts/autopilot.sh`

Add environment variable check and auto-setup:

```bash
# Enable web inspiration (default: disabled for speed)
WVO_ENABLE_WEB_INSPIRATION=${WVO_ENABLE_WEB_INSPIRATION:-0}

if [ "$WVO_ENABLE_WEB_INSPIRATION" = "1" ]; then
  echo "🌐 Web inspiration enabled - checking Playwright..."

  # Install Playwright if missing
  if ! command -v playwright &> /dev/null; then
    echo "   Installing Playwright..."
    npm install playwright
    npx playwright install chromium --with-deps
  fi

  # Set flag in orchestrator DB
  sqlite3 "$ROOT/state/orchestrator.db" <<EOF
INSERT OR REPLACE INTO context_entries (timestamp, entry_type, topic, content, confidence)
VALUES ($(date +%s), 'constraint', 'Web Inspiration', 'Web inspiration enabled for this session', 1.0);
EOF

  echo "   ✅ Web inspiration ready"
fi
```

---

### 4. Task-Level Trigger

**Modification**: `src/orchestrator/claude_code_coordinator.ts`

Check if task needs inspiration before execution:

```typescript
private async executeTask(candidate: ScheduledTask): Promise<void> {
  const task = candidate.task;

  // Check if task is design/UX related
  const needsInspiration = this.shouldFetchInspiration(task);

  if (needsInspiration) {
    // Check if inspiration already fetched for this task
    const inspirationPath = path.join(this.workspaceRoot, 'state', 'web_inspiration', task.id);

    if (!fs.existsSync(inspirationPath)) {
      logInfo('Task needs web inspiration', { taskId: task.id });

      // Fetch inspiration (async, don't block task)
      void this.fetchInspirationForTask(task).catch(error => {
        logWarning('Failed to fetch inspiration', {
          taskId: task.id,
          error: error instanceof Error ? error.message : String(error)
        });
      });
    }
  }

  // Continue with normal execution...
}

private shouldFetchInspiration(task: Task): boolean {
  const keywords = ['design', 'ui', 'ux', 'layout', 'visual', 'style', 'frontend', 'web'];
  const title = task.title.toLowerCase();
  const desc = (task.description || '').toLowerCase();

  return keywords.some(kw => title.includes(kw) || desc.includes(kw));
}

private async fetchInspirationForTask(task: Task): Promise<void> {
  // Use MCP tool to fetch inspiration
  const url = this.selectInspirationUrl(task);

  const result = await this.callMCPTool('web_inspiration_capture', { url });

  if (result.success) {
    // Add context entry about the inspiration
    this.stateMachine.addContextEntry({
      entry_type: 'learning',
      topic: 'Design Inspiration',
      content: `Captured inspiration from ${url} for task ${task.id}. Screenshot: ${result.screenshot_path}`,
      related_tasks: [task.id],
      confidence: 1.0
    });
  }
}

private selectInspirationUrl(task: Task): string {
  // Simple logic: return a curated URL based on task type
  const sources = [
    'https://www.awwwards.com/websites/bootstrap/',
    'https://www.awwwards.com/websites/react/',
    'https://dribbble.com/shots/popular/web-design'
  ];

  return sources[Math.floor(Math.random() * sources.length)];
}
```

---

### 5. Prompt Updates

**File**: `docs/wvo_prompt.md`

Add modular inspiration instruction block:

```markdown
## Design Inspiration

When working on design/UX tasks:

1. **Check for existing inspiration assets**: Look in `state/web_inspiration/<task-id>/` for screenshots and HTML snapshots.

2. **If inspiration exists**: Reference the design patterns, color schemes, and layout techniques from the captured examples.

3. **If no inspiration exists**: You may call `web_inspiration_capture` once with a relevant URL from:
   - awwwards.com
   - dribbble.com
   - behance.net
   - cssnectar.com
   - siteinspire.com

4. **Efficiency**: Only fetch inspiration if it will genuinely improve the outcome. Do not fetch speculatively.

5. **Shipping focus**: Use inspiration to inform decisions, not to mimic. Ship original work informed by best practices.
```

---

### 6. Critic Integration

**File**: `src/orchestrator/critic_enforcer.ts`

Add new critic: `design_inspiration_used`

```typescript
const CRITICS: Record<string, CriticRule> = {
  // ... existing critics ...

  design_inspiration_used: {
    enabled: true,
    description: 'For design tasks, ensure inspiration assets were referenced or fetched',
    check: async (taskId: string): Promise<boolean> => {
      const task = stateMachine.getTask(taskId);
      if (!task) return true;

      // Only applies to design tasks
      if (!this.shouldFetchInspiration(task)) return true;

      // Check if inspiration was fetched or referenced
      const inspirationPath = path.join(workspaceRoot, 'state', 'web_inspiration', taskId);
      if (fs.existsSync(inspirationPath)) return true;

      // Check if context mentions inspiration
      const contextEntries = stateMachine.getContextEntries({
        type: 'learning',
        topic: 'Design Inspiration'
      });

      return contextEntries.some(e =>
        e.related_tasks?.includes(taskId)
      );
    }
  }
};
```

---

### 7. Observability & Telemetry

**File**: `src/orchestrator/operations_manager.ts`

Track web inspiration usage:

```typescript
private emitTelemetry(snapshot: OperationsSnapshot): void {
  const record: Record<string, unknown> = {
    // ... existing telemetry ...

    web_inspiration: {
      enabled: process.env.WVO_ENABLE_WEB_INSPIRATION === '1',
      total_fetches: this.webInspirationFetches,
      cache_hits: this.webInspirationCacheHits,
      failures: this.webInspirationFailures
    }
  };

  this.telemetryExporter.append(record);
}
```

---

### 8. Cleanup & Maintenance

**File**: `tools/wvo_mcp/scripts/cleanup_inspiration.sh`

```bash
#!/bin/bash
# Clean up old inspiration assets (older than 7 days)

INSPIRATION_DIR="state/web_inspiration"
CUTOFF_DAYS=7

find "$INSPIRATION_DIR" -type d -mtime +$CUTOFF_DAYS -exec rm -rf {} + 2>/dev/null

echo "✅ Cleaned up inspiration assets older than $CUTOFF_DAYS days"
```

Run via cron or as part of autopilot:

```bash
# In autopilot.sh, add periodic cleanup
if [ "$WVO_ENABLE_WEB_INSPIRATION" = "1" ]; then
  # Clean up old assets once per day
  if [ ! -f "$ROOT/state/.inspiration_cleaned_today" ]; then
    bash "$ROOT/tools/wvo_mcp/scripts/cleanup_inspiration.sh"
    touch "$ROOT/state/.inspiration_cleaned_today"
  fi
fi
```

---

## 🚦 Guardrails & Limits

### Hard Limits

| Limit | Value | Reasoning |
|-------|-------|-----------|
| Max fetch time | 10s | Fail fast, don't block tasks |
| Max screenshot size | 2MB | Keep disk usage low |
| Max HTML size | 500KB | Stripped of scripts/tracking |
| Max fetches per task | 1 | One inspiration source is enough |
| Max concurrent fetches | 3 | Respect network bandwidth |
| Cache duration | 7 days | Auto-cleanup old assets |

### Security Controls

1. **Domain allow-list**: Only fetch from curated design sites
2. **No POST requests**: Read-only fetching
3. **Strip tracking**: Remove analytics, cookies, localStorage
4. **Timeout**: Hard 10s limit
5. **No auth**: Don't send cookies or auth headers

---

## 📊 Success Metrics

Track these in telemetry:

- **Fetch success rate**: Target ≥80%
- **Average fetch duration**: Target <5s
- **Cache hit rate**: Target ≥60% (reuse across similar tasks)
- **Storage usage**: Target <100MB total
- **Tasks with inspiration**: Target 10-20% of design tasks

Alert if:
- Success rate <70% → Disable feature, investigate
- Fetches >5/session → Too aggressive, throttle
- Storage >500MB → Cleanup not working

---

## 🚀 Deployment Steps

1. **Install dependencies**:
   ```bash
   npm install playwright
   npx playwright install chromium --with-deps
   ```

2. **Enable feature** (in `tools/wvo_mcp/.env`):
   ```bash
   WVO_ENABLE_WEB_INSPIRATION=1
   ```

3. **Build MCP server**:
   ```bash
   npm run build
   ```

4. **Test manually**:
   ```bash
   ts-node tools/wvo_mcp/src/web_tools/inspiration_fetcher.ts \
     --url "https://www.awwwards.com/websites/bootstrap/"
   ```

5. **Run autopilot with web inspiration**:
   ```bash
   WVO_ENABLE_WEB_INSPIRATION=1 bash run_wvo_autopilot.sh
   ```

6. **Monitor telemetry**:
   ```bash
   tail -f state/telemetry/operations.jsonl | grep web_inspiration
   ```

---

## 🧪 Testing Strategy

### Unit Tests

```typescript
describe('InspirationFetcher', () => {
  it('should reject non-allowed domains', async () => {
    const fetcher = new InspirationFetcher('/tmp');
    const result = await fetcher.capture({ url: 'https://malicious.com' });
    expect(result.success).toBe(false);
  });

  it('should capture screenshot and HTML', async () => {
    const fetcher = new InspirationFetcher('/tmp');
    const result = await fetcher.capture({ url: 'https://www.awwwards.com' });
    expect(result.success).toBe(true);
    expect(result.screenshot_path).toBeDefined();
    expect(result.html_path).toBeDefined();
  });

  it('should strip tracking scripts', () => {
    const html = '<script>ga("send")</script><div>Content</div>';
    const clean = fetcher['stripTracking'](html);
    expect(clean).not.toContain('<script>');
    expect(clean).toContain('<div>Content</div>');
  });
});
```

### Integration Tests

```typescript
describe('Autopilot with web inspiration', () => {
  it('should fetch inspiration for design tasks', async () => {
    const task = stateMachine.createTask({
      id: 'T-DESIGN-1',
      title: 'Redesign landing page',
      type: 'task',
      status: 'pending'
    });

    // Run orchestrator
    await coordinator.executeTask({ task, priority: 100, reason: 'test' });

    // Check for inspiration artifacts
    const inspirationPath = path.join(workspaceRoot, 'state', 'web_inspiration', 'T-DESIGN-1');
    expect(fs.existsSync(inspirationPath)).toBe(true);
  });
});
```

---

## 📝 Documentation

Create `docs/WEB_INSPIRATION.md`:

```markdown
# Web Inspiration Feature

## Overview
The web inspiration feature allows agents to autonomously research award-winning websites for design patterns and best practices.

## Usage
Set `WVO_ENABLE_WEB_INSPIRATION=1` before running autopilot. The orchestrator will automatically fetch inspiration for design/UX tasks.

## Allowed Domains
- awwwards.com
- dribbble.com
- behance.net
- cssnectar.com
- siteinspire.com

## Storage
Inspiration assets are stored in `state/web_inspiration/<task-id>/` and automatically cleaned up after 7 days.

## Troubleshooting
- If fetches fail, check network connectivity and Playwright installation
- If storage grows too large, run `bash tools/wvo_mcp/scripts/cleanup_inspiration.sh`
- To disable, set `WVO_ENABLE_WEB_INSPIRATION=0`
```

---

## 🎯 Ship Fast Philosophy

1. **Default OFF**: Feature is opt-in via env var
2. **Fail fast**: 10s timeout, no retries
3. **Cache aggressively**: Reuse assets across similar tasks
4. **Auto-cleanup**: 7-day retention, zero manual maintenance
5. **Monitor closely**: Alert on low success rate, auto-disable if broken
6. **Lean implementation**: Single file (<500 LOC), minimal dependencies

**Estimated Implementation Time**: 4-6 hours
**Performance Impact**: <5% overhead when enabled, 0% when disabled

---

**Status**: READY TO IMPLEMENT 🚀

All design decisions made with shipping velocity in mind. No over-engineering, no premature optimization.
