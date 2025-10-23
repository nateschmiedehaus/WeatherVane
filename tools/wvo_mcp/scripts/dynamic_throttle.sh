#!/usr/bin/env bash
#
# Dynamic Throttle - Adaptive resource management
#
# Monitors system resources in real-time and adjusts:
# - Agent count (reduce when overloaded)
# - Batch sizes (smaller under pressure)
# - Delays between operations (increase when stressed)
# - Concurrency limits (reduce when necessary)
#
# Returns throttle level: 0 (no throttle) to 3 (heavy throttle)
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
METRICS_FILE="$ROOT/state/analytics/resource_metrics.json"

# Thresholds
MEMORY_CRITICAL_PCT=90  # Below 10% free
MEMORY_HIGH_PCT=80      # Below 20% free
MEMORY_MEDIUM_PCT=70    # Below 30% free

CPU_CRITICAL_PCT=90
CPU_HIGH_PCT=75
CPU_MEDIUM_PCT=60

#
# Get system metrics
#
get_memory_pressure() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        local free_mb=$(vm_stat | awk '/Pages free/ {print int($3 * 4096 / 1048576)}')
        local total_mb=$(sysctl -n hw.memsize | awk '{print int($1/1048576)}')
        local used_pct=$(( (total_mb - free_mb) * 100 / total_mb ))
        echo "$used_pct"
    else
        # Linux
        free | awk '/^Mem:/ {print int(($3/$2) * 100)}'
    fi
}

get_cpu_pressure() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS - sample for 1 second
        local idle=$(top -l 2 -n 0 -s 1 2>/dev/null | tail -1 | awk '/CPU usage/ {print int($7)}' || echo "50")
        echo $((100 - idle))
    else
        # Linux
        local load=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | tr -d ',')
        local cores=$(nproc)
        awk -v load="$load" -v cores="$cores" 'BEGIN {print int((load/cores) * 100)}'
    fi
}

count_claude_processes() {
    ps aux | grep -c "[c]laude" || echo "0"
}

count_node_processes() {
    pgrep -f "node.*index-claude.js" | wc -l | tr -d ' '
}

#
# Calculate throttle level (0-3)
#
calculate_throttle() {
    local mem_pct=$1
    local cpu_pct=$2
    local claude_count=$3
    local node_count=$4

    local throttle=0

    # Memory-based throttling
    if [ "$mem_pct" -ge "$MEMORY_CRITICAL_PCT" ]; then
        throttle=3
    elif [ "$mem_pct" -ge "$MEMORY_HIGH_PCT" ]; then
        [ "$throttle" -lt 2 ] && throttle=2
    elif [ "$mem_pct" -ge "$MEMORY_MEDIUM_PCT" ]; then
        [ "$throttle" -lt 1 ] && throttle=1
    fi

    # CPU-based throttling
    if [ "$cpu_pct" -ge "$CPU_CRITICAL_PCT" ]; then
        throttle=3
    elif [ "$cpu_pct" -ge "$CPU_HIGH_PCT" ]; then
        [ "$throttle" -lt 2 ] && throttle=2
    elif [ "$cpu_pct" -ge "$CPU_MEDIUM_PCT" ]; then
        [ "$throttle" -lt 1 ] && throttle=1
    fi

    # Process count throttling
    if [ "$claude_count" -ge 3 ]; then
        [ "$throttle" -lt 2 ] && throttle=2
    fi

    if [ "$node_count" -ge 4 ]; then
        [ "$throttle" -lt 2 ] && throttle=2
    fi

    echo "$throttle"
}

#
# Get throttle parameters for given level
#
get_throttle_params() {
    local level=$1

    case $level in
        0)
            # No throttle
            echo '{
                "level": 0,
                "name": "normal",
                "max_agents": 5,
                "batch_size": 100,
                "delay_ms": 0,
                "max_concurrent": 3,
                "reasoning_effort": "high"
            }'
            ;;
        1)
            # Light throttle
            echo '{
                "level": 1,
                "name": "light",
                "max_agents": 3,
                "batch_size": 50,
                "delay_ms": 500,
                "max_concurrent": 2,
                "reasoning_effort": "medium"
            }'
            ;;
        2)
            # Medium throttle
            echo '{
                "level": 2,
                "name": "medium",
                "max_agents": 2,
                "batch_size": 25,
                "delay_ms": 1000,
                "max_concurrent": 1,
                "reasoning_effort": "medium"
            }'
            ;;
        3)
            # Heavy throttle
            echo '{
                "level": 3,
                "name": "heavy",
                "max_agents": 1,
                "batch_size": 10,
                "delay_ms": 2000,
                "max_concurrent": 1,
                "reasoning_effort": "low"
            }'
            ;;
        *)
            echo '{"level": 0, "name": "normal", "max_agents": 5, "batch_size": 100, "delay_ms": 0, "max_concurrent": 3, "reasoning_effort": "high"}'
            ;;
    esac
}

#
# Save metrics to file
#
save_metrics() {
    local mem_pct=$1
    local cpu_pct=$2
    local claude_count=$3
    local node_count=$4
    local throttle=$5

    mkdir -p "$(dirname "$METRICS_FILE")"

    cat > "$METRICS_FILE" <<EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "memory_used_pct": $mem_pct,
  "cpu_used_pct": $cpu_pct,
  "claude_processes": $claude_count,
  "node_processes": $node_count,
  "throttle_level": $throttle,
  "throttle_params": $(get_throttle_params "$throttle")
}
EOF
}

#
# Main
#
main() {
    local mem_pct=$(get_memory_pressure)
    local cpu_pct=$(get_cpu_pressure)
    local claude_count=$(count_claude_processes)
    local node_count=$(count_node_processes)

    local throttle=$(calculate_throttle "$mem_pct" "$cpu_pct" "$claude_count" "$node_count")

    # Save metrics
    save_metrics "$mem_pct" "$cpu_pct" "$claude_count" "$node_count" "$throttle"

    # Output throttle parameters
    get_throttle_params "$throttle"

    # Human-readable output to stderr
    if [ "${QUIET:-0}" != "1" ]; then
        local params=$(get_throttle_params "$throttle")
        local level_name=$(echo "$params" | grep -o '"name": "[^"]*"' | cut -d'"' -f4)
        local max_agents=$(echo "$params" | grep -o '"max_agents": [0-9]*' | awk '{print $2}')

        >&2 echo "Resource Status:"
        >&2 echo "  Memory: ${mem_pct}% used"
        >&2 echo "  CPU: ${cpu_pct}% busy"
        >&2 echo "  Claude processes: $claude_count"
        >&2 echo "  Node processes: $node_count"
        >&2 echo ""
        >&2 echo "Throttle: $level_name (level $throttle)"
        >&2 echo "  Max agents: $max_agents"
    fi

    # Return throttle level as exit code (0-3)
    return "$throttle"
}

main "$@"
