# Agent Library - WeatherVane Operating Manual

**Welcome to the WeatherVane Agent Library** - your comprehensive guide to roles, responsibilities, standards, and processes.

## 🎯 Start Here

**New to WeatherVane?** Read this first:
1. [System Overview](#system-overview)
2. [Your Role](#find-your-role)
3. [Common Standards](#common-standards)
4. [How to Navigate](#navigation)

---

## System Overview

WeatherVane is a multi-agent orchestration system that:
- **Builds** weather-aware marketing intelligence platform
- **Coordinates** autonomous agents (Atlas, Director Dana, Workers, Critics)
- **Maintains** quality through continuous verification and health monitoring
- **Delivers** world-class product with 85-95% quality across all dimensions

**Core Principle**: Every agent operates with clear autonomy bounds, escalation protocols, and quality standards.

---

## Find Your Role

### 🏛️ Strategic Leadership

**[Atlas (Orchestrator)](/docs/agent_library/roles/atlas/charter.md)**
- **Who**: Strategic captain, drives major decisions
- **Autonomy**: Strategic (highest level)
- **Max Complexity**: 10/10
- **Key Docs**: [Charter](/docs/agent_library/roles/atlas/charter.md) • [Responsibilities](/docs/agent_library/roles/atlas/responsibilities.md) • [Decision Authority](/docs/agent_library/roles/atlas/decision_authority.md)

**[Director Dana (Infrastructure)](/docs/agent_library/roles/director_dana/charter.md)**
- **Who**: Automation & infrastructure coordinator
- **Autonomy**: Tactical
- **Max Complexity**: 8/10
- **Key Docs**: [Charter](/docs/agent_library/roles/director_dana/charter.md) • [Infrastructure Scope](/docs/agent_library/roles/director_dana/infrastructure_scope.md) • [Critic Coordination](/docs/agent_library/roles/director_dana/critic_coordination.md)

### 👷 Execution Layer

**[Workers](/docs/agent_library/roles/workers/charter.md)**
- **Who**: Task execution specialists
- **Autonomy**: Operational
- **Max Complexity**: 6/10
- **Key Docs**: [Charter](/docs/agent_library/roles/workers/charter.md) • [Task Execution Guide](/docs/agent_library/roles/workers/task_execution_guide.md) • [Autonomy Bounds](/docs/agent_library/roles/workers/autonomy_bounds.md)

**[Critics](/docs/agent_library/roles/critics/charter.md)**
- **Who**: Quality review specialists (25+ specialized critics)
- **Autonomy**: Operational
- **Authority**: Advisory → Blocking → Critical
- **Key Docs**: [Charter](/docs/agent_library/roles/critics/charter.md) • [Critic Identities](/docs/agent_library/roles/critics/critic_identities.md) • [Quality Framework](/docs/agent_library/roles/critics/quality_framework.md)

---

## Common Standards

**Every agent must follow these core standards:**

### 📏 Quality Standards
- [Universal Quality Standards](/docs/agent_library/common/standards/quality_standards.md) - 7 dimensions (code, architecture, UX, communication, scientific rigor, performance, security)
- [Testing Standards](/docs/agent_library/common/standards/testing_standards.md) - Universal test protocol (Essential 7)
- [Coding Standards](/docs/agent_library/common/standards/coding_standards.md) - TypeScript/Python conventions

### 🔒 Security & Safety
- [Security Standards](/docs/agent_library/common/standards/security_standards.md) - Secrets, auth, policies
- [Communication Standards](/docs/agent_library/common/standards/communication_standards.md) - Logging, telemetry, escalation

### ⚠️ Mandatory: Verification Loop
**CRITICAL**: Before claiming any task "done", you MUST complete the [Verification Loop](/docs/agent_library/common/concepts/verification_loop.md):
1. Build (0 errors)
2. Test (all pass, 7/7 coverage)
3. Audit (0 vulnerabilities)
4. Runtime (no errors)
5. Documentation (complete)

**Exit criteria must ALL pass before marking complete.**

---

## Core Concepts

**Understand how the system works:**

- [Roadmap Management](/docs/agent_library/common/concepts/roadmap_management.md) - How tasks, epics, milestones work
- [Dependency Graph](/docs/agent_library/common/concepts/dependency_graph.md) - DAG concepts, blocking relationships
- [Quality Gates](/docs/agent_library/common/concepts/quality_gates.md) - When/how to block vs advisory
- [Escalation Protocol](/docs/agent_library/common/concepts/escalation_protocol.md) - When to escalate, to whom
- [Verification Loop](/docs/agent_library/common/concepts/verification_loop.md) - Build→Test→Audit→Runtime cycle
- [Health Monitoring](/docs/agent_library/common/concepts/health_monitoring.md) - OODA loop, auto-remediation

---

## Standard Processes

**How to execute common workflows:**

- [Task Lifecycle](/docs/agent_library/common/processes/task_lifecycle.md) - pending → in_progress → done
- [Critic Workflow](/docs/agent_library/common/processes/critic_workflow.md) - How critics run, backoff policy
- [Blocker Escalation](/docs/agent_library/common/processes/blocker_escalation.md) - SLA enforcement (10min, 30min, 2hr)
- [Health Monitoring](/docs/agent_library/common/processes/health_monitoring.md) - Meta-monitoring, anomaly detection

---

## Domain Knowledge

**Specialized knowledge by domain:**

### 📦 Product
- [Product Overview](/docs/agent_library/domains/product/overview.md)
- [Weather Intelligence](/docs/agent_library/domains/product/weather_intelligence.md)
- [Demo Standards](/docs/agent_library/domains/product/demo_standards.md)
- [UX Principles](/docs/agent_library/domains/product/ux_principles.md)

### 🤖 Machine Learning
- [ML Overview](/docs/agent_library/domains/ml/overview.md)
- [Modeling Standards](/docs/agent_library/domains/ml/modeling_standards.md) - R² thresholds, baselines
- [Data Quality](/docs/agent_library/domains/ml/data_quality.md)
- [Causal Inference](/docs/agent_library/domains/ml/causal_inference.md)

### 🏗️ Infrastructure
- [Infrastructure Overview](/docs/agent_library/domains/infrastructure/overview.md)
- [MCP Architecture](/docs/agent_library/domains/infrastructure/mcp_architecture.md)
- [Autopilot System](/docs/agent_library/domains/infrastructure/autopilot_system.md)
- [Observability](/docs/agent_library/domains/infrastructure/observability.md)

### 🔐 Security
- [Security Overview](/docs/agent_library/domains/security/overview.md)
- [Secrets Management](/docs/agent_library/domains/security/secrets_management.md)
- [Audit Requirements](/docs/agent_library/domains/security/audit_requirements.md)

---

## Tools Reference

**How to use available tools:**

- [MCP Tools Reference](/docs/agent_library/common/tools/mcp_tools_reference.md) - All MCP tools (plan_next, plan_update, etc.)
- [Database Queries](/docs/agent_library/common/tools/database_queries.md) - StateMachine API, SQL patterns
- [Telemetry & Logging](/docs/agent_library/common/tools/telemetry_logging.md) - How to log decisions, metrics

---

## Navigation

### By Role
- [Atlas (Strategic)](/docs/agent_library/roles/atlas/) - Strategic planning, complex architecture
- [Director Dana (Tactical)](/docs/agent_library/roles/director_dana/) - Infrastructure, critic coordination
- [Workers (Operational)](/docs/agent_library/roles/workers/) - Task execution
- [Critics (Quality)](/docs/agent_library/roles/critics/) - Quality review

### By Domain
- [Product](/docs/agent_library/domains/product/) - Weather intelligence, UX, demos
- [ML](/docs/agent_library/domains/ml/) - Modeling, data quality, causal inference
- [Infrastructure](/docs/agent_library/domains/infrastructure/) - MCP, autopilot, observability
- [Security](/docs/agent_library/domains/security/) - Secrets, policies, audits

### By Activity
- **Starting a task?** → [Task Execution Guide](/docs/agent_library/roles/workers/task_execution_guide.md)
- **Reviewing code?** → [Critic Workflow](/docs/agent_library/common/processes/critic_workflow.md)
- **Making a decision?** → [Decision Authority](/docs/agent_library/roles/atlas/decision_authority.md)
- **Need to escalate?** → [Escalation Protocol](/docs/agent_library/common/concepts/escalation_protocol.md)
- **Task stuck?** → [Blocker Escalation](/docs/agent_library/common/processes/blocker_escalation.md)

---

## Quick Reference

### Exit Criteria Checklist
Before marking ANY task done:
- [ ] Build passes (0 errors)
- [ ] Tests pass (all green)
- [ ] Test coverage: 7/7 dimensions
- [ ] npm audit: 0 vulnerabilities
- [ ] Feature runs without errors (if applicable)
- [ ] Resources stay bounded (if applicable)
- [ ] Documentation complete

### Escalation Quick Guide
- **Complexity > your max** → Escalate to Atlas
- **Infrastructure issues** → Escalate to Director Dana
- **Security concerns** → Escalate to Security Sentinel critic
- **Stuck >10 min** → Log blocker, alert assigned agent
- **Stuck >30 min** → Escalate to orchestrator
- **Stuck >2 hr** → Critical escalation to Director Dana

### Quality Standards Quick Check
All work must meet **85-95%** across:
1. Code Elegance
2. Architecture Design
3. User Experience
4. Communication Clarity
5. Scientific Rigor
6. Performance Efficiency
7. Security Robustness

---

## Contributing

This library is maintained by the agent collective. To propose updates:
1. Create task in roadmap with `type: documentation`
2. Submit via consensus if standards/processes change
3. Atlas approves major structural changes

**Last Updated**: 2025-10-23
**Maintainers**: Atlas, Director Dana, Agent Collective
**Version**: 1.0.0
