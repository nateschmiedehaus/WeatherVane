#!/usr/bin/env bash
# Self-Healing Integration Gap Detector & Auto-Fixer
# Purpose: Detect integration gaps and AUTOMATICALLY trigger remediation via Spec→Monitor
set -e

WORKSPACE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$WORKSPACE_ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*"; }
log_error() { echo -e "${RED}[$(date '+%H:%M:%S')] ERROR:${NC} $*"; }
log_warn() { echo -e "${YELLOW}[$(date '+%H:%M:%S')] WARN:${NC} $*"; }
log_success() { echo -e "${GREEN}[$(date '+%H:%M:%S')] ✓${NC} $*"; }

GAPS_FOUND=0
GAPS_FIXED=0
GAPS_FAILED=0

echo "=========================================="
echo "Integration Gap Auto-Fixer"
echo "=========================================="
log "Scanning for integration gaps..."
echo ""

# ==========================================
# GAP 1: HeartbeatWriter Not in OrchestratorRuntime
# ==========================================
log "Checking: HeartbeatWriter integration..."

if grep -q "HeartbeatWriter" src/orchestrator/unified_orchestrator.ts 2>/dev/null; then
  if ! grep -q "HeartbeatWriter" src/orchestrator/orchestrator_runtime.ts 2>/dev/null; then
    GAPS_FOUND=$((GAPS_FOUND + 1))
    log_error "GAP DETECTED: HeartbeatWriter in UnifiedOrchestrator but not in OrchestratorRuntime"

    log "TRIGGERING AUTO-FIX..."

    # Create remediation task
    cat > /tmp/gap_fix_heartbeat.md <<'FIX_EOF'
# Auto-Remediation: HeartbeatWriter Integration Gap

## SPEC
**Goal**: Integrate HeartbeatWriter into OrchestratorRuntime (actual entry point)
**Why**: worker_entry.js uses OrchestratorRuntime, not UnifiedOrchestrator
**Acceptance Criteria**:
- HeartbeatWriter imported in orchestrator_runtime.ts
- HeartbeatWriter started in OrchestratorRuntime.start()
- HeartbeatWriter stopped in OrchestratorRuntime.stop()
- Integration test verifies heartbeat file created

## PLAN
1. Import HeartbeatWriter in orchestrator_runtime.ts
2. Add private field: heartbeatWriter: HeartbeatWriter | null = null
3. In start(): instantiate and start heartbeat
4. In stop(): stop heartbeat if exists
5. Add integration test
6. Verify with npm test

## IMPLEMENT
Pattern: Follow existing monitor pattern in OrchestratorRuntime

## VERIFY
- Build passes (0 errors)
- Tests pass (heartbeat file created)
- Integration test proves OrchestratorRuntime writes heartbeat
FIX_EOF

    log "Created remediation spec: /tmp/gap_fix_heartbeat.md"

    # Execute remediation (could trigger MCP tool or manual fix)
    if [ "$AUTO_FIX_ENABLED" = "1" ]; then
      log "AUTO-FIX MODE: Applying HeartbeatWriter integration..."

      # Read current orchestrator_runtime.ts
      if [ -f "src/orchestrator/orchestrator_runtime.ts" ]; then
        # Add import if not exists
        if ! grep -q "import.*HeartbeatWriter" src/orchestrator/orchestrator_runtime.ts; then
          log "Adding HeartbeatWriter import..."
          # This would be done by MCP tool or automated edit
          log_warn "Manual fix required: Add HeartbeatWriter import to orchestrator_runtime.ts"
          GAPS_FAILED=$((GAPS_FAILED + 1))
        else
          log_success "HeartbeatWriter already imported"
          GAPS_FIXED=$((GAPS_FIXED + 1))
        fi
      else
        log_error "orchestrator_runtime.ts not found"
        GAPS_FAILED=$((GAPS_FAILED + 1))
      fi
    else
      log_warn "AUTO-FIX disabled. Remediation spec created but not applied."
      log "To enable: export AUTO_FIX_ENABLED=1"
      GAPS_FAILED=$((GAPS_FAILED + 1))
    fi
  else
    log_success "HeartbeatWriter correctly integrated in OrchestratorRuntime"
  fi
else
  log_success "HeartbeatWriter not in UnifiedOrchestrator (no gap)"
fi

echo ""

# ==========================================
# GAP 2: SafetyMonitor Not in OrchestratorRuntime
# ==========================================
log "Checking: SafetyMonitor integration..."

if grep -q "SafetyMonitor" src/orchestrator/unified_orchestrator.ts 2>/dev/null; then
  if ! grep -q "SafetyMonitor" src/orchestrator/orchestrator_runtime.ts 2>/dev/null; then
    GAPS_FOUND=$((GAPS_FOUND + 1))
    log_error "GAP DETECTED: SafetyMonitor in UnifiedOrchestrator but not in OrchestratorRuntime"
    log_warn "Auto-fix not implemented yet (similar to HeartbeatWriter)"
    GAPS_FAILED=$((GAPS_FAILED + 1))
  else
    log_success "SafetyMonitor correctly integrated"
  fi
else
  log_success "SafetyMonitor not in wrong location (no gap)"
fi

echo ""

# ==========================================
# GAP 3: Documented But Not Implemented
# ==========================================
log "Checking: Implementation completeness..."

# Extract expected files from PLAN docs
PLAN_DOCS=$(find docs/autopilot -name "*PLAN*.md" 2>/dev/null)

if [ -n "$PLAN_DOCS" ]; then
  EXPECTED_FILES=$(grep -hEo "(tools/|src/|scripts/)[a-zA-Z0-9_/]+\.(ts|js|sh|json)" $PLAN_DOCS 2>/dev/null | sort -u || true)

  if [ -n "$EXPECTED_FILES" ]; then
    MISSING_COUNT=0
    while IFS= read -r FILE; do
      if [ ! -f "$FILE" ]; then
        if [ $MISSING_COUNT -eq 0 ]; then
          GAPS_FOUND=$((GAPS_FOUND + 1))
          log_error "GAP DETECTED: Files documented in PLAN but not created:"
        fi
        log_error "  MISSING: $FILE"
        MISSING_COUNT=$((MISSING_COUNT + 1))
        GAPS_FAILED=$((GAPS_FAILED + 1))
      fi
    done <<< "$EXPECTED_FILES"

    if [ $MISSING_COUNT -eq 0 ]; then
      log_success "All documented files exist"
    fi
  else
    log "No file references found in PLAN docs"
  fi
else
  log "No PLAN docs found"
fi

echo ""

# ==========================================
# GAP 4: Supervisor Script Path Issues
# ==========================================
log "Checking: Supervisor script paths..."

SUPERVISOR_SCRIPT="tools/wvo_mcp/scripts/supervise_autopilot.sh"

if [ -f "$SUPERVISOR_SCRIPT" ]; then
  # Check for hardcoded wrong paths
  if grep -q "autopilot_unified.js" "$SUPERVISOR_SCRIPT" 2>/dev/null; then
    GAPS_FOUND=$((GAPS_FOUND + 1))
    log_error "GAP DETECTED: Supervisor references non-existent autopilot_unified.js"

    if [ "$AUTO_FIX_ENABLED" = "1" ]; then
      log "AUTO-FIX: Updating to correct path..."

      # Backup
      cp "$SUPERVISOR_SCRIPT" "${SUPERVISOR_SCRIPT}.autofix.bak"

      # Fix path
      sed -i'' 's|autopilot_unified\.js|worker/worker_entry.js|g' "$SUPERVISOR_SCRIPT"

      # Verify fix
      if grep -q "worker/worker_entry.js" "$SUPERVISOR_SCRIPT"; then
        log_success "Path fixed: Now uses worker/worker_entry.js"
        GAPS_FIXED=$((GAPS_FIXED + 1))
      else
        log_error "Fix failed"
        GAPS_FAILED=$((GAPS_FAILED + 1))
      fi
    else
      log_warn "AUTO-FIX disabled. Manual fix required."
      GAPS_FAILED=$((GAPS_FAILED + 1))
    fi
  else
    log_success "Supervisor script paths correct"
  fi
else
  log "Supervisor script not found (skipping)"
fi

echo ""

# ==========================================
# GAP 5: Assumptions in STRATEGIZE Docs
# ==========================================
log "Checking: Assumptions in STRATEGIZE docs..."

STRATEGIZE_DOCS=$(find docs/autopilot -name "*STRATEGIZE*.md" 2>/dev/null)

if [ -n "$STRATEGIZE_DOCS" ]; then
  ASSUMPTION_COUNT=$(grep -hEi "assume|probably|should be|likely" $STRATEGIZE_DOCS 2>/dev/null | wc -l | tr -d ' ')

  if [ "$ASSUMPTION_COUNT" -gt 0 ]; then
    GAPS_FOUND=$((GAPS_FOUND + 1))
    log_error "GAP DETECTED: $ASSUMPTION_COUNT unverified assumptions in STRATEGIZE docs"
    log_warn "Assumptions should be replaced with verified facts (DISCOVER phase)"
    GAPS_FAILED=$((GAPS_FAILED + 1))
  else
    log_success "No unverified assumptions found"
  fi
else
  log "No STRATEGIZE docs found"
fi

echo ""

# ==========================================
# Summary
# ==========================================
echo "=========================================="
echo "Integration Gap Summary"
echo "=========================================="
log "Gaps found: $GAPS_FOUND"
log "Gaps fixed: $GAPS_FIXED"
log "Gaps failed: $GAPS_FAILED"

if [ $GAPS_FOUND -eq 0 ]; then
  log_success "No integration gaps detected"
  exit 0
elif [ $GAPS_FAILED -eq 0 ]; then
  log_success "All gaps automatically fixed!"
  exit 0
else
  echo ""
  log_error "$GAPS_FAILED gap(s) require manual remediation"

  if [ "$AUTO_FIX_ENABLED" != "1" ]; then
    echo ""
    log "To enable automatic fixes:"
    echo "  export AUTO_FIX_ENABLED=1"
    echo "  bash scripts/auto_fix_integration_gaps.sh"
  fi

  echo ""
  log "See remediation specs in:"
  echo "  /tmp/gap_fix_*.md"

  echo ""
  log "Next steps:"
  echo "  1. Review remediation specs"
  echo "  2. Apply fixes (manual or auto)"
  echo "  3. Run verification: npm test && npm run build"
  echo "  4. Re-run this script to verify fixes"

  exit 1
fi
