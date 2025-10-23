#!/usr/bin/env python3
"""Populate architecture database with WeatherVane structure"""

from architecture_kb import ArchitectureKB

def populate():
    kb = ArchitectureKB()
    kb.connect()

    print("=== Populating WeatherVane Architecture ===\n")

    # Level 1: System
    kb.add_component(
        'SYS-WEATHERVANE',
        'WeatherVane Platform',
        'system',
        'Weather-aware advertising allocation platform with forecasting and ML',
        purpose='Optimize advertising spend based on weather impact on ROAS',
        domain='product',
        language='TypeScript/Python',
        status='active',
        health='healthy'
    )

    # Level 2: Major Subsystems
    subsystems = [
        ('SUBSYS-MCP', 'MCP Orchestrator', 'Autonomous task execution and quality control', 'tools/wvo_mcp/src', 'TypeScript'),
        ('SUBSYS-WEATHER', 'Weather Data Pipeline', 'Ingest, transform, and serve weather data', 'apps/api', 'TypeScript'),
        ('SUBSYS-ML', 'ML Modeling', 'Weather-aware forecasting and allocation models', 'modeling/', 'Python'),
        ('SUBSYS-WEB', 'Web Application', 'User interface and experience', 'apps/web', 'TypeScript'),
        ('SUBSYS-API', 'API Layer', 'Backend services and data access', 'apps/api', 'TypeScript'),
    ]

    for comp_id, name, desc, entry, lang in subsystems:
        kb.add_component(
            comp_id, name, 'subsystem', desc,
            parent_id='SYS-WEATHERVANE',
            entry_point=entry,
            language=lang,
            domain='product',
            status='active'
        )

    # Level 3: MCP Components
    mcp_components = [
        ('COMP-MCP-ORCHESTRATOR', 'Unified Orchestrator', 'Main orchestration engine', 'src/orchestrator/unified_orchestrator.ts', 'E6'),
        ('COMP-MCP-QUALITY', 'Quality Gate System', 'Multi-gate quality verification', 'src/orchestrator/quality_gate_orchestrator.ts', 'E6'),
        ('COMP-MCP-ROADMAP', 'Roadmap Tracker', 'Task and epic management', 'src/orchestrator/roadmap_tracker.ts', 'E6'),
        ('COMP-MCP-AGENTS', 'Agent Pool', 'Worker agent management', 'src/orchestrator/agent_pool.ts', 'E6'),
        ('COMP-MCP-ROUTER', 'Model Router', 'AI model selection and routing', 'src/orchestrator/model_router.ts', 'E6'),
        ('COMP-MCP-CRITICS', 'Critic System', 'Quality and health monitoring', 'src/critics/', 'E6'),
    ]

    for comp_id, name, desc, entry, epic in mcp_components:
        kb.add_component(
            comp_id, name, 'component', desc,
            parent_id='SUBSYS-MCP',
            epic_id=epic,
            entry_point=entry,
            language='TypeScript',
            domain='mcp',
            status='active'
        )

    # Level 4: Key Modules (Quality Gates)
    quality_modules = [
        ('MOD-QG-ORCHESTRATOR', 'QualityGateOrchestrator', 'Coordinates 4-gate review process', 'src/orchestrator/quality_gate_orchestrator.ts'),
        ('MOD-QG-ADVERSARIAL', 'AdversarialBullshitDetector', 'Detects superficial completion', 'src/orchestrator/adversarial_bullshit_detector.ts'),
        ('MOD-QG-DOMAIN-EXPERT', 'DomainExpertReviewer', 'Multi-domain genius-level reviews', 'src/orchestrator/domain_expert_reviewer.ts'),
    ]

    for comp_id, name, desc, entry in quality_modules:
        kb.add_component(
            comp_id, name, 'module', desc,
            parent_id='COMP-MCP-QUALITY',
            epic_id='E6',
            entry_point=entry,
            language='TypeScript',
            domain='mcp',
            status='active',
            test_coverage=100.0  # These have tests
        )

    # Relationships
    print("\n=== Creating Relationships ===\n")

    # MCP depends on quality
    kb.add_relationship('COMP-MCP-ORCHESTRATOR', 'COMP-MCP-QUALITY', 'depends_on',
                       'Orchestrator calls quality gates before marking tasks done', 'critical')

    # Quality uses domain expert
    kb.add_relationship('COMP-MCP-QUALITY', 'MOD-QG-DOMAIN-EXPERT', 'depends_on',
                       'Quality gates use domain expert reviews', 'strong')

    # Quality uses adversarial
    kb.add_relationship('COMP-MCP-QUALITY', 'MOD-QG-ADVERSARIAL', 'depends_on',
                       'Quality gates use adversarial detector', 'strong')

    # Orchestrator uses model router
    kb.add_relationship('COMP-MCP-ORCHESTRATOR', 'COMP-MCP-ROUTER', 'depends_on',
                       'Routes AI tasks to appropriate models', 'critical')

    # Orchestrator uses agents
    kb.add_relationship('COMP-MCP-ORCHESTRATOR', 'COMP-MCP-AGENTS', 'depends_on',
                       'Manages worker agent pool', 'critical')

    # Orchestrator uses roadmap
    kb.add_relationship('COMP-MCP-ORCHESTRATOR', 'COMP-MCP-ROADMAP', 'depends_on',
                       'Reads tasks from roadmap', 'critical')

    # Critics monitor quality
    kb.add_relationship('COMP-MCP-CRITICS', 'COMP-MCP-QUALITY', 'monitors',
                       'Critics verify quality gate effectiveness', 'normal')

    # Cross-subsystem
    kb.add_relationship('SUBSYS-MCP', 'SUBSYS-API', 'configures',
                       'MCP manages API deployments', 'normal')

    kb.add_relationship('SUBSYS-ML', 'SUBSYS-WEATHER', 'depends_on',
                       'ML models use weather data', 'critical')

    kb.add_relationship('SUBSYS-WEB', 'SUBSYS-API', 'depends_on',
                       'Web calls API for data', 'critical')

    print("\n=== Health Report ===\n")
    report = kb.get_health_report()
    import json
    print(json.dumps(report, indent=2))

    kb.close()

    print("\n✅ Architecture database populated")
    print(f"   Database: state/architecture.db")
    print(f"\nUsage:")
    print(f"  python3 tools/wvo_mcp/scripts/architecture_kb.py search quality")
    print(f"  python3 tools/wvo_mcp/scripts/architecture_kb.py get COMP-MCP-QUALITY")
    print(f"  python3 tools/wvo_mcp/scripts/architecture_kb.py health")

if __name__ == '__main__':
    populate()
