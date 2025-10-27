#!/usr/bin/env bash
# app_smoke_e2e.sh
# End-to-end smoke test for WeatherVane autopilot

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WVO_MCP_DIR="$ROOT_DIR/tools/wvo_mcp"
SMOKE_MODE="${SMOKE_MODE:-full}"
TIMEOUT="${SMOKE_TIMEOUT:-120}"
MAX_DISK_PERCENT="${SMOKE_MAX_DISK_PERCENT:-90}"
WARN_DISK_PERCENT="${SMOKE_WARN_DISK_PERCENT:-80}"

# Normalise threshold inputs (strip decimals if provided)
MAX_DISK_PERCENT="${MAX_DISK_PERCENT%.*}"
WARN_DISK_PERCENT="${WARN_DISK_PERCENT%.*}"

log_info() { echo -e "${GREEN}[SMOKE]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[SMOKE]${NC} $*"; }
log_error() { echo -e "${RED}[SMOKE]${NC} $*" >&2; }
log_step() { echo -e "\n${GREEN}==>${NC} $*"; }

start_time=$(date +%s)

cleanup() {
  local exit_code=$?
  local duration=$(($(date +%s) - start_time))
  if [[ $exit_code -eq 0 ]]; then
    log_info "✅ All smoke tests passed in ${duration}s"
  else
    log_error "❌ Smoke tests failed with exit code $exit_code after ${duration}s"
  fi
  exit $exit_code
}
trap cleanup EXIT

# Test 1: Build
smoke_build() {
  log_step "Smoke Test 1/5: Build Check"
  if [[ "$SMOKE_MODE" == "quick" ]]; then
    log_warn "Skipping build in quick mode"
    return 0
  fi
  cd "$WVO_MCP_DIR"
  npm run build || return 1
  log_info "✅ Build passed"
}

# Test 2: Critical tests
smoke_tests() {
  log_step "Smoke Test 2/5: Critical Tests"
  cd "$WVO_MCP_DIR"
  
  # Run quality gate integration test (most critical)
  log_info "Running quality_gate_integration.test.ts..."
  npm test quality_gate_integration || return 2
  
  if [[ "$SMOKE_MODE" != "quick" ]]; then
    log_info "Running unified_orchestrator.test.ts..."
    npm test unified_orchestrator || return 2
  fi
  
  log_info "✅ Critical tests passed"
}

# Test 3: Audit
smoke_audit() {
  log_step "Smoke Test 3/5: Security Audit"
  if [[ "$SMOKE_MODE" == "quick" ]]; then
    log_warn "Skipping audit in quick mode"
    return 0
  fi
  cd "$ROOT_DIR"
  npm audit --audit-level=high || return 4
  log_info "✅ Audit passed"
}

# Test 4: MCP Server
smoke_mcp_server() {
  log_step "Smoke Test 4/5: MCP Server Health"
  local mcp_pid_file="$ROOT_DIR/state/.mcp.pid"
  if [[ ! -f "$mcp_pid_file" ]]; then
    log_warn "MCP server not running (OK for CI)"
    return 0
  fi
  local mcp_pid=$(cat "$mcp_pid_file")
  if ps -p "$mcp_pid" > /dev/null 2>&1; then
    log_info "✅ MCP server running (PID: $mcp_pid)"
  else
    log_warn "MCP server not found (may have restarted)"
  fi
}

# Test 5: File system
smoke_filesystem() {
  log_step "Smoke Test 5/5: File System Health"
  local critical_dirs=("$ROOT_DIR/state" "$ROOT_DIR/state/analytics" "$ROOT_DIR/evidence" "$ROOT_DIR/docs/autopilot")
  for dir in "${critical_dirs[@]}"; do
    [[ -d "$dir" ]] || { log_error "❌ Missing: $dir"; return 1; }
  done
  
  local disk_usage=$(df "$ROOT_DIR" | tail -1 | awk '{print $5}' | sed 's/%//')
  if [[ $disk_usage -gt $MAX_DISK_PERCENT ]]; then
    log_error "❌ Disk critical: ${disk_usage}% (threshold ${MAX_DISK_PERCENT}%)"
    return 1
  elif [[ $disk_usage -gt $WARN_DISK_PERCENT ]]; then
    log_warn "⚠️  Disk high: ${disk_usage}% (warn ${WARN_DISK_PERCENT}%)"
  fi
  
  log_info "✅ File system healthy (disk: ${disk_usage}%)"
}

# Main
main() {
  log_info "Starting smoke tests (mode: $SMOKE_MODE)"
  smoke_build || exit 1
  smoke_tests || exit 2
  smoke_audit || exit 4
  smoke_mcp_server || exit 3
  smoke_filesystem || exit 1
  log_info "🎉 All smoke tests passed!"
}

main "$@"
