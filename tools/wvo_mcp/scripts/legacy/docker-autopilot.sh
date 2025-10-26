#!/bin/bash
# WeatherVane Autopilot - Docker Management Script
# Safely runs autopilot in isolated container with resource limits

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT/tools/wvo_mcp"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $*"
}

log_success() {
    echo -e "${GREEN}✓${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $*"
}

log_error() {
    echo -e "${RED}✗${NC} $*"
}

# Check Docker is installed
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first:"
        echo "  macOS: brew install --cask docker"
        echo "  Linux: curl -fsSL https://get.docker.com | sh"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running. Please start Docker."
        exit 1
    fi
}

# Check required environment variables
check_env() {
    local missing=0

    if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
        log_warn "ANTHROPIC_API_KEY not set (Claude won't work)"
        missing=1
    fi

    if [[ -z "${OPENAI_API_KEY:-}" ]] && [[ -z "${CODEX_API_KEY:-}" ]]; then
        log_warn "Neither OPENAI_API_KEY nor CODEX_API_KEY set (Codex won't work)"
        missing=1
    fi

    if [[ $missing -eq 1 ]]; then
        log_warn "Set API keys in ~/.bashrc or ~/.zshrc:"
        echo "  export ANTHROPIC_API_KEY='your-key-here'"
        echo "  export OPENAI_API_KEY='your-key-here'"
        echo ""
        read -p "Continue anyway? [y/N] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Build Docker image
build() {
    log_info "Building WeatherVane Docker image..."
    docker-compose build mcp-server autopilot
    log_success "Docker image built successfully"
}

# Start autopilot
start() {
    log_info "Starting WeatherVane Autopilot (containerized)..."

    # Start MCP server first
    docker-compose up -d mcp-server
    log_success "MCP server started"

    # Wait for health check
    log_info "Waiting for MCP server to be healthy..."
    for i in {1..30}; do
        if docker-compose ps mcp-server | grep -q "healthy"; then
            log_success "MCP server is healthy"
            break
        fi
        sleep 1
        if [[ $i -eq 30 ]]; then
            log_error "MCP server failed to become healthy"
            docker-compose logs --tail=50 mcp-server
            exit 1
        fi
    done

    # Start autopilot
    docker-compose up -d autopilot
    log_success "Autopilot started"

    echo ""
    log_info "Autopilot is running in container with resource limits:"
    echo "  • Max CPUs: 6 cores"
    echo "  • Max Memory: 12 GB"
    echo "  • Max Processes: 10"
    echo ""
    log_info "View logs: $0 logs"
    log_info "Stop autopilot: $0 stop"
}

# Stop autopilot
stop() {
    log_info "Stopping WeatherVane Autopilot..."
    docker-compose down
    log_success "Autopilot stopped and containers removed"
}

# Restart autopilot
restart() {
    stop
    sleep 2
    start
}

# Show logs
logs() {
    local service="${1:-autopilot}"
    log_info "Showing logs for $service (Ctrl+C to exit)..."
    docker-compose logs -f --tail=100 "$service"
}

# Show status
status() {
    log_info "WeatherVane Container Status:"
    docker-compose ps

    echo ""
    log_info "Resource Usage:"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}" \
        weathervane-mcp weathervane-autopilot 2>/dev/null || echo "No containers running"
}

# Enter container shell
shell() {
    local service="${1:-autopilot}"
    log_info "Opening shell in $service container..."
    docker-compose exec "$service" /bin/bash
}

# Clean up everything
clean() {
    log_warn "This will remove all containers, images, and volumes!"
    read -p "Are you sure? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Cleaning up..."
        docker-compose down -v --rmi all
        log_success "Cleanup complete"
    fi
}

# Show help
show_help() {
    cat <<HELP
WeatherVane Autopilot - Docker Management

Usage: $0 <command> [options]

Commands:
  build       Build Docker images
  start       Start autopilot in container
  stop        Stop and remove containers
  restart     Restart autopilot
  logs        Show autopilot logs (Ctrl+C to exit)
  status      Show container status and resource usage
  shell       Open shell in container
  clean       Remove all containers, images, and volumes
  help        Show this help message

Examples:
  $0 start                # Start autopilot
  $0 logs                 # Follow autopilot logs
  $0 logs mcp-server      # Follow MCP server logs
  $0 status               # Check resource usage
  $0 stop                 # Stop everything

Safety Features:
  ✓ Hard CPU limit (6 cores max)
  ✓ Hard memory limit (12 GB max)
  ✓ Process limit (10 max)
  ✓ Isolated from host system
  ✓ Easy cleanup with 'stop'

Environment Variables:
  ANTHROPIC_API_KEY       Claude API key (required)
  OPENAI_API_KEY          OpenAI/Codex API key (optional)
  CODEX_API_KEY           Codex API key (optional)

Set in ~/.bashrc or ~/.zshrc:
  export ANTHROPIC_API_KEY='your-key-here'
  export OPENAI_API_KEY='your-key-here'

HELP
}

# Main command dispatcher
main() {
    local command="${1:-help}"

    case "$command" in
        build)
            check_docker
            build
            ;;
        start)
            check_docker
            check_env
            start
            ;;
        stop)
            check_docker
            stop
            ;;
        restart)
            check_docker
            check_env
            restart
            ;;
        logs)
            check_docker
            logs "${2:-autopilot}"
            ;;
        status)
            check_docker
            status
            ;;
        shell)
            check_docker
            shell "${2:-autopilot}"
            ;;
        clean)
            check_docker
            clean
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "Unknown command: $command"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

main "$@"
