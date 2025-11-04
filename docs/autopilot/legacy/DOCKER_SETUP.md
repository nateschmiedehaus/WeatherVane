# WeatherVane Docker Setup

**Safe, isolated autopilot execution with hard resource limits**

---

## Why Docker?

Running autopilot in Docker provides:

✅ **Hard resource limits** - Cannot exceed 6 CPUs, 12GB RAM
✅ **System isolation** - Container crashes don't affect your Mac
✅ **Easy cleanup** - One command stops everything
✅ **No system pollution** - All processes contained
✅ **Reproducible** - Same environment every time

---

## Quick Start

### 1. Install Docker

**macOS:**
```bash
brew install --cask docker
# Start Docker.app from Applications
```

**Linux:**
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER  # Add yourself to docker group
# Log out and back in
```

### 2. Set API Keys

Add to `~/.bashrc` or `~/.zshrc`:
```bash
export ANTHROPIC_API_KEY='sk-ant-...'
export OPENAI_API_KEY='sk-...'         # Optional
export CODEX_API_KEY='...'             # Optional
```

Reload shell:
```bash
source ~/.bashrc  # or ~/.zshrc
```

### 3. Build Docker Image

```bash
cd /path/to/WeatherVane
./scripts/docker-autopilot.sh build
```

**Expected output:**
```
ℹ Building WeatherVane Docker image...
[+] Building 45.2s (18/18) FINISHED
✓ Docker image built successfully
```

### 4. Start Autopilot

```bash
./scripts/docker-autopilot.sh start
```

**Expected output:**
```
ℹ Starting WeatherVane Autopilot (containerized)...
✓ MCP server started
ℹ Waiting for MCP server to be healthy...
✓ MCP server is healthy
✓ Autopilot started

ℹ Autopilot is running in container with resource limits:
  • Max CPUs: 6 cores
  • Max Memory: 12 GB
  • Max Processes: 10

ℹ View logs: ./scripts/docker-autopilot.sh logs
ℹ Stop autopilot: ./scripts/docker-autopilot.sh stop
```

---

## Usage

### View Logs (Live)
```bash
./scripts/docker-autopilot.sh logs
# Press Ctrl+C to exit
```

### Check Status
```bash
./scripts/docker-autopilot.sh status
```

**Output shows:**
- Container status (running/stopped)
- CPU usage (%)
- Memory usage (current/limit)
- Network I/O
- Block I/O

### Stop Autopilot
```bash
./scripts/docker-autopilot.sh stop
```

**This immediately:**
- Stops all containers
- Removes containers
- Frees all resources
- **Cannot harm your system**

### Restart Autopilot
```bash
./scripts/docker-autopilot.sh restart
```

### Open Shell in Container
```bash
./scripts/docker-autopilot.sh shell
# Now you're inside the container
# Type 'exit' to leave
```

### Clean Up Everything
```bash
./scripts/docker-autopilot.sh clean
# Removes containers, images, volumes
```

---

## Resource Limits

### Hard Limits (Cannot Exceed)

| Resource | Limit | Description |
|----------|-------|-------------|
| CPUs | 6 cores | Max CPU cores container can use |
| Memory | 12 GB | Max RAM container can use |
| Processes | 10 | Max concurrent CLI processes |
| Memory per process | 6 GB | Node.js heap limit |

**What happens if limits are hit:**
- CPU: Container throttled, tasks slow down
- Memory: Container killed and restarted
- Processes: New processes blocked until slot opens

**Your system is SAFE:**
- Container CANNOT exceed these limits
- If container crashes, your Mac is unaffected
- Other apps continue normally

### Reserved Resources (Guaranteed)

| Resource | Reserved | Description |
|----------|----------|-------------|
| CPUs | 3 cores | Minimum guaranteed |
| Memory | 6 GB | Minimum guaranteed |

---

## Architecture

### Services

**1. MCP Server (weathervane-mcp)**
- Main orchestration service
- Manages task queue
- Coordinates agents
- Resource limits: 4 CPUs, 8 GB RAM

**2. Autopilot (weathervane-autopilot)**
- Autonomous task execution
- Spawns agent processes
- Executes tasks continuously
- Resource limits: 6 CPUs, 12 GB RAM

### Data Persistence

These directories are **mounted from your Mac**, not copied into the container:

```
host                          → container
./state                       → /workspace/state          (read/write)
./docs                        → /workspace/docs           (read/write)
./apps                        → /workspace/apps           (read-only)
./shared                      → /workspace/shared         (read-only)
./tools/wvo_mcp/logs          → /workspace/logs           (read/write)
```

**This means:**
- Database changes persist when container stops
- Logs are visible on your Mac
- Code changes on Mac are visible in container
- Stopping container doesn't lose data

---

## Troubleshooting

### Container Won't Start

**Check Docker is running:**
```bash
docker info
```

**Check logs:**
```bash
./scripts/docker-autopilot.sh logs mcp-server
```

**Common issues:**
- Docker daemon not running → Start Docker.app
- Port conflicts → Stop other services on same ports
- Insufficient resources → Close other apps to free memory

### Container Keeps Crashing

**Check resource usage:**
```bash
./scripts/docker-autopilot.sh status
```

**If hitting memory limit:**
- Tasks are too memory-intensive
- Reduce `AGENT_COUNT` in `docker-compose.yml`
- Increase memory limit (if you have RAM available)

**View crash logs:**
```bash
cd tools/wvo_mcp && docker-compose logs --tail=100 autopilot
```

### Tasks Still Failing

**The containerization doesn't fix task logic issues!**

If tasks fail with "Resource limits exceeded" in container:
1. Check the container's internal limits (already fixed to 10 processes)
2. Check task readiness (already integrated)
3. Check for blocked tasks: `sqlite3 state/orchestrator.db "SELECT COUNT(*) FROM tasks WHERE status='blocked';"`

### Can't Stop Container

**Force stop:**
```bash
cd tools/wvo_mcp && docker-compose down --timeout 5
# or
docker kill weathervane-mcp weathervane-autopilot
```

**Nuclear option:**
```bash
docker stop $(docker ps -q)  # Stop all containers
```

---

## Advanced Configuration

### Change Resource Limits

Edit `tools/wvo_mcp/docker-compose.yml`:

```yaml
services:
  autopilot:
    deploy:
      resources:
        limits:
          cpus: '8.0'      # Increase CPU limit
          memory: 16G      # Increase RAM limit
```

Then restart:
```bash
./scripts/docker-autopilot.sh restart
```

### Change Agent Count

Edit `tools/wvo_mcp/docker-compose.yml`:

```yaml
environment:
  - AGENT_COUNT=5  # More agents = more parallel work
```

**Trade-off:**
- More agents = faster throughput
- More agents = more memory usage
- Recommended: 3-5 agents for 12 GB limit

### Enable Observability

Edit `tools/wvo_mcp/docker-compose.yml`:

```yaml
environment:
  - WVO_OTEL_ENABLED=1  # Enable OpenTelemetry tracing
```

### Run MCP Server Only (No Autopilot)

```bash
cd tools/wvo_mcp && docker-compose up -d mcp-server
```

Useful for:
- Testing MCP tools manually
- Running single tasks via CLI
- Debugging without continuous execution

---

## Comparison: Docker vs Native

| Feature | Native (Current) | Docker (New) |
|---------|------------------|--------------|
| **Safety** | ⚠️ Can consume all system resources | ✅ Hard limits enforced |
| **Isolation** | ❌ Runs on host directly | ✅ Fully isolated |
| **Cleanup** | ⚠️ May leave orphaned processes | ✅ One command stops all |
| **Setup** | ✅ No Docker needed | ⚠️ Requires Docker |
| **Performance** | ✅ Native speed | ⚠️ ~5% overhead |
| **Debugging** | ✅ Direct access to processes | ⚠️ Need to exec into container |
| **System Impact** | ❌ Can slow down Mac | ✅ Limited impact |

**Recommendation:** Use Docker for safety and peace of mind.

---

## Security

### What Docker CANNOT Do

Even with Docker, the container:
- ✅ Cannot modify files outside mounted volumes
- ✅ Cannot access other users' files
- ✅ Cannot shut down your Mac
- ✅ Cannot install system packages on host
- ✅ Cannot spawn processes on host

### What Docker CAN Do

The container CAN:
- ⚠️ Modify files in mounted volumes (`./state`, `./docs`, etc.)
- ⚠️ Use network (to call APIs)
- ⚠️ Consume resources up to limits

### Additional Hardening (Optional)

**Read-only root filesystem:**
```yaml
services:
  autopilot:
    read_only: true
    tmpfs:
      - /tmp
      - /app/logs
```

**Drop capabilities:**
```yaml
services:
  autopilot:
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
```

**No network access:**
```yaml
services:
  autopilot:
    network_mode: none  # Blocks all network (breaks API calls!)
```

---

## FAQ

### Q: Will this slow down my Mac?

**A:** Much less than native execution! Docker enforces CPU/memory limits, preventing resource exhaustion.

### Q: Can I still use native execution?

**A:** Yes! The native scripts still work:
```bash
bash tools/wvo_mcp/scripts/autopilot_unified.sh  # Native
./scripts/docker-autopilot.sh start               # Docker
```

### Q: What if I don't have Docker?

**A:** Use native execution with the fixes applied today:
- Resource limits increased (3→10 processes)
- Task readiness checks active
- Shutdown handlers fixed
- Blocked tasks unblocked

**But Docker is recommended for safety.**

### Q: Does this work on Linux?

**A:** Yes! The Docker setup works on:
- ✅ macOS (Intel + Apple Silicon)
- ✅ Linux (x86_64 + ARM64)
- ⚠️ Windows (requires WSL2)

### Q: How do I update the code?

**A:** Code changes on host are reflected in container (via volume mounts). But you need to rebuild after changing dependencies:

```bash
# Changed TypeScript code? No rebuild needed (volumes mounted)
./scripts/docker-autopilot.sh restart

# Changed package.json? Rebuild required
./scripts/docker-autopilot.sh stop
./scripts/docker-autopilot.sh build
./scripts/docker-autopilot.sh start
```

---

## Summary

**To run autopilot safely in Docker:**

```bash
# One-time setup
brew install --cask docker
export ANTHROPIC_API_KEY='sk-ant-...'
./scripts/docker-autopilot.sh build

# Start autopilot
./scripts/docker-autopilot.sh start

# View logs
./scripts/docker-autopilot.sh logs

# Stop autopilot
./scripts/docker-autopilot.sh stop
```

**Your Mac is now SAFE from:**
- ✅ Resource exhaustion
- ✅ Runaway processes
- ✅ System crashes
- ✅ Process leaks

**The container is LIMITED to:**
- 6 CPU cores maximum
- 12 GB RAM maximum
- 10 concurrent processes maximum

**Enjoy safe, isolated autopilot execution!** 🚀
