# Memory Detection Fix - ProcessManager

## Problem

ProcessManager was incorrectly blocking autopilot from spawning worker processes due to falsely reporting high memory usage on macOS.

### Root Cause

The ProcessManager used `os.freemem()` to calculate available memory, which on macOS reports only immediately free RAM, **excluding cached/inactive pages** that are actually available for use.

**Example on macOS with 16GB RAM:**
- `os.freemem()`: 210 MB
- **Actual available** (free + inactive + speculative): 5,403 MB
- False usage calculation: 98.7% (should be ~67%)
- Result: ProcessManager refused to spawn processes due to exceeding 80% threshold

### Impact

**Autopilot was completely broken:**
- All tasks failed immediately (within 339ms)
- No worker processes could spawn
- Error: "Memory usage too high to spawn process"
- System effectively paralyzed despite having 5+ GB actually available

## Solution

Implemented cross-platform memory detection in `getAvailableMemoryBytes()` method:

### Linux
Reads `/proc/meminfo` and uses `MemAvailable` field, which includes:
- Free memory
- Reclaimable cache
- Buffers

### macOS
Executes `vm_stat` and sums:
- Pages free
- Pages inactive (can be reclaimed)
- Pages speculative (can be reclaimed)

Multiplies by page size (typically 16KB on macOS) to get bytes.

### Fallback
Falls back to `os.freemem()` on other platforms or if detection fails.

## Results

### Before Fix
```
Available Memory: 210 MB
Total Memory: 16,384 MB
Memory Usage: 98.7%
Status: ❌ BLOCKED (exceeds 80% threshold)
Can Spawn: NO
```

### After Fix
```
Available Memory: 5,403 MB
Total Memory: 16,384 MB
Memory Usage: 67.0%
Status: ✅ ALLOWED (under 80% threshold)
Can Spawn: YES
```

## Verification

### Build
```bash
npm run build
# ✅ 0 errors
```

### Tests
```bash
npm test
# ✅ 985/985 passing, 9 skipped
```

### Audit
```bash
npm audit
# ✅ 0 vulnerabilities
```

### Runtime
```bash
node -e "const pm = require('./dist/orchestrator/process_manager.js').ProcessManager; ..."
# Available: 5403 MB (was 210 MB)
# Usage: 67.02% (was 98.7%)
# Under 80% threshold: YES ✅
```

## Code Changes

**File:** `tools/wvo_mcp/src/orchestrator/process_manager.ts`

**Lines modified:**
- Line 13-14: Added `execSync` and `readFileSync` imports
- Line 239: Use `getAvailableMemoryBytes()` instead of `os.freemem()`
- Line 244: Updated `availableMemoryMB` calculation
- Line 255-294: New `getAvailableMemoryBytes()` method with platform-specific logic

## Impact on Autopilot

**Before:** Tasks failed immediately, no work done
**After:** ProcessManager correctly allows spawning when sufficient memory available

This fix is **critical** for autopilot functionality. Without it, the system cannot execute any tasks regardless of actual available resources.

## Testing

Created inline test demonstrating the fix:
```javascript
const ProcessManager = require('./dist/orchestrator/process_manager.js').ProcessManager;
const pm = new ProcessManager();
const snapshot = pm.getResourceSnapshot();
console.log('Available Memory MB:', snapshot.availableMemoryMB);
console.log('Memory Usage %:', snapshot.memoryUsagePercent.toFixed(2));
console.log('Under threshold?', snapshot.memoryUsagePercent < 80 ? 'YES ✓' : 'NO ✗');
```

## References

- **vm_stat man page:** Shows macOS virtual memory statistics
- **Linux /proc/meminfo:** Documents MemAvailable field
- **ProcessManager:** `tools/wvo_mcp/src/orchestrator/process_manager.ts`
- **Issue:** Autopilot tasks failing with "Resource limits exceeded"
