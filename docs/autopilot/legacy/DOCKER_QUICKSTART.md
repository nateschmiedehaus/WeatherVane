# Docker Quickstart - WeatherVane Autopilot

**Run autopilot safely in an isolated container with hard resource limits**

---

## 🚀 Quick Start (3 commands)

```bash
# 1. Build container (one-time)
./scripts/docker-autopilot.sh build

# 2. Start autopilot
./scripts/docker-autopilot.sh start

# 3. View logs
./scripts/docker-autopilot.sh logs
```

**Stop anytime:** `./scripts/docker-autopilot.sh stop`

---

## ✅ Safety Guarantees

**Hard limits enforced by Docker:**
- 🔒 Max 6 CPU cores
- 🔒 Max 12 GB RAM
- 🔒 Max 10 processes
- 🔒 Cannot access files outside workspace
- 🔒 Cannot shut down your Mac

**If container crashes → your Mac is unaffected!**

---

## 📋 Prerequisites

**1. Install Docker**
```bash
# macOS
brew install --cask docker
# Then start Docker.app

# Linux
curl -fsSL https://get.docker.com | sh
```

**2. Set API keys**

Add to `~/.bashrc` or `~/.zshrc`:
```bash
export ANTHROPIC_API_KEY='sk-ant-...'
export OPENAI_API_KEY='sk-...'  # Optional
```

Then: `source ~/.bashrc`

---

## 📖 All Commands

```bash
# Management
./scripts/docker-autopilot.sh build     # Build Docker image
./scripts/docker-autopilot.sh start     # Start autopilot
./scripts/docker-autopilot.sh stop      # Stop everything
./scripts/docker-autopilot.sh restart   # Restart autopilot

# Monitoring
./scripts/docker-autopilot.sh logs      # View logs (Ctrl+C to exit)
./scripts/docker-autopilot.sh status    # Check resource usage

# Debug
./scripts/docker-autopilot.sh shell     # Open shell in container

# Cleanup
./scripts/docker-autopilot.sh clean     # Remove everything
```

---

## 🔍 Check Status

```bash
./scripts/docker-autopilot.sh status
```

**Shows:**
- Container status (running/stopped)
- CPU usage (current/limit)
- Memory usage (current/limit)
- Network/disk I/O

---

## 🛑 Emergency Stop

**If something goes wrong:**
```bash
./scripts/docker-autopilot.sh stop
```

**If that doesn't work:**
```bash
cd tools/wvo_mcp && docker-compose down --timeout 5
```

**Nuclear option:**
```bash
docker stop $(docker ps -q)  # Stop ALL containers
```

---

## ⚙️ Configuration

**Change resource limits** - Edit `tools/wvo_mcp/docker-compose.yml`:

```yaml
deploy:
  resources:
    limits:
      cpus: '8.0'      # Increase CPU
      memory: 16G      # Increase RAM
```

**Change agent count** - Edit `tools/wvo_mcp/docker-compose.yml`:

```yaml
environment:
  - AGENT_COUNT=5    # More agents = more parallel work
```

---

## 🆚 Docker vs Native

| Feature | Native | Docker |
|---------|--------|--------|
| **Safety** | ⚠️ Can exhaust system | ✅ Hard limits |
| **Isolation** | ❌ Runs on host | ✅ Isolated |
| **Cleanup** | ⚠️ May leak processes | ✅ One command |
| **Setup** | ✅ No Docker needed | ⚠️ Requires Docker |

**Recommendation: Use Docker for peace of mind.**

---

## 🐛 Troubleshooting

**Container won't start:**
```bash
# Check Docker is running
docker info

# Check logs
./scripts/docker-autopilot.sh logs mcp-server
```

**Out of memory:**
- Reduce `AGENT_COUNT` in `docker-compose.yml`
- Or increase memory limit

**Tasks still failing:**
- Containerization doesn't fix task logic bugs
- Check for blocked tasks in database
- Review task failure logs

---

## 📚 Full Documentation

See `docs/DOCKER_SETUP.md` for:
- Detailed architecture
- Security hardening
- Advanced configuration
- Complete troubleshooting guide

---

## ✨ What's Different from Native?

**All today's fixes are included:**
- ✅ Task readiness checks (prevents thrashing)
- ✅ Shutdown crash fixes (idempotent handlers)
- ✅ Resource limit fixes (10 processes, not 3)
- ✅ Blocked tasks unblocked (40 tasks freed)

**PLUS Docker safety:**
- ✅ Hard resource caps
- ✅ System isolation
- ✅ Easy cleanup

---

**Ready to run safely? Start here:**

```bash
./scripts/docker-autopilot.sh build
./scripts/docker-autopilot.sh start
```

🎉 **Your Mac is now protected from resource exhaustion!**
