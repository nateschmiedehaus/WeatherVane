-- Architecture Knowledge Base Schema
-- Tracks hierarchical architecture across all levels with cross-references

-- Core architecture registry
CREATE TABLE IF NOT EXISTS architecture_components (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    component_id TEXT UNIQUE NOT NULL,  -- e.g., "SYS-001", "EPIC-001", "MOD-001"
    name TEXT NOT NULL,
    level TEXT NOT NULL,  -- 'system', 'epic', 'subsystem', 'component', 'module', 'function'
    parent_id TEXT,  -- References another component_id

    -- Core info
    description TEXT,
    purpose TEXT,  -- Why does this exist?
    responsibilities TEXT,  -- What does it do?

    -- Technical details
    language TEXT,  -- TypeScript, Python, etc.
    entry_point TEXT,  -- File path or main function
    dependencies TEXT,  -- JSON array of component_ids this depends on
    dependents TEXT,  -- JSON array of component_ids that depend on this

    -- Documentation
    doc_path TEXT,  -- Path to main documentation
    design_doc_path TEXT,  -- Path to design document
    diagram_path TEXT,  -- Path to architecture diagram

    -- Status
    status TEXT DEFAULT 'active',  -- 'active', 'deprecated', 'planned', 'wip'
    health TEXT DEFAULT 'unknown',  -- 'healthy', 'degraded', 'failing', 'unknown'
    test_coverage REAL,  -- Percentage

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_verified_at TIMESTAMP,

    -- Cross-references
    epic_id TEXT,  -- Which epic owns this?
    domain TEXT  -- 'product', 'mcp', 'infra', etc.
);

-- Architecture relationships (beyond parent-child)
CREATE TABLE IF NOT EXISTS architecture_relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_component_id TEXT NOT NULL,
    to_component_id TEXT NOT NULL,
    relationship_type TEXT NOT NULL,  -- 'depends_on', 'calls', 'configures', 'monitors', 'extends'
    description TEXT,
    bidirectional BOOLEAN DEFAULT 0,
    strength TEXT DEFAULT 'normal',  -- 'weak', 'normal', 'strong', 'critical'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (from_component_id) REFERENCES architecture_components(component_id),
    FOREIGN KEY (to_component_id) REFERENCES architecture_components(component_id)
);

-- Architecture decisions (ADRs)
CREATE TABLE IF NOT EXISTS architecture_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    adr_id TEXT UNIQUE NOT NULL,  -- e.g., "ADR-001"
    title TEXT NOT NULL,
    date DATE NOT NULL,
    status TEXT DEFAULT 'proposed',  -- 'proposed', 'accepted', 'rejected', 'superseded', 'deprecated'

    -- Decision record
    context TEXT NOT NULL,  -- What is the context/problem?
    decision TEXT NOT NULL,  -- What did we decide?
    consequences TEXT,  -- What are the consequences?
    alternatives TEXT,  -- What alternatives were considered?

    -- References
    affects_components TEXT,  -- JSON array of component_ids
    supersedes_adr TEXT,  -- ADR this supersedes
    superseded_by_adr TEXT,  -- ADR that supersedes this

    -- Metadata
    author TEXT,
    reviewers TEXT,  -- JSON array

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Architecture changes log
CREATE TABLE IF NOT EXISTS architecture_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    component_id TEXT NOT NULL,
    change_type TEXT NOT NULL,  -- 'created', 'modified', 'deprecated', 'deleted', 'moved'
    description TEXT,
    old_value TEXT,  -- JSON of previous state
    new_value TEXT,  -- JSON of new state
    reason TEXT,
    task_id TEXT,  -- Which task caused this change?
    commit_hash TEXT,

    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    changed_by TEXT,

    FOREIGN KEY (component_id) REFERENCES architecture_components(component_id)
);

-- Architecture queries (common navigation patterns)
CREATE TABLE IF NOT EXISTS architecture_queries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query_name TEXT UNIQUE NOT NULL,
    description TEXT,
    sql_query TEXT NOT NULL,
    use_case TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_components_level ON architecture_components(level);
CREATE INDEX IF NOT EXISTS idx_components_parent ON architecture_components(parent_id);
CREATE INDEX IF NOT EXISTS idx_components_epic ON architecture_components(epic_id);
CREATE INDEX IF NOT EXISTS idx_components_status ON architecture_components(status);
CREATE INDEX IF NOT EXISTS idx_relationships_from ON architecture_relationships(from_component_id);
CREATE INDEX IF NOT EXISTS idx_relationships_to ON architecture_relationships(to_component_id);
CREATE INDEX IF NOT EXISTS idx_decisions_status ON architecture_decisions(status);
CREATE INDEX IF NOT EXISTS idx_changes_component ON architecture_changes(component_id);

-- Insert common queries
INSERT OR IGNORE INTO architecture_queries (query_name, description, sql_query, use_case) VALUES
('get_component_hierarchy',
 'Get full hierarchy for a component (ancestors and descendants)',
 'WITH RECURSIVE hierarchy AS (
    SELECT component_id, name, level, parent_id, 0 as depth
    FROM architecture_components WHERE component_id = ?
    UNION ALL
    SELECT c.component_id, c.name, c.level, c.parent_id, h.depth + 1
    FROM architecture_components c
    JOIN hierarchy h ON c.parent_id = h.component_id
  )
  SELECT * FROM hierarchy ORDER BY depth;',
 'Navigate up and down the architecture tree'),

('get_dependencies',
 'Get all dependencies for a component',
 'SELECT r.to_component_id, c.name, c.level, r.relationship_type, r.strength
  FROM architecture_relationships r
  JOIN architecture_components c ON r.to_component_id = c.component_id
  WHERE r.from_component_id = ?
  ORDER BY r.strength DESC, c.level;',
 'Find what a component depends on'),

('get_dependents',
 'Get all components that depend on this one',
 'SELECT r.from_component_id, c.name, c.level, r.relationship_type, r.strength
  FROM architecture_relationships r
  JOIN architecture_components c ON r.from_component_id = c.component_id
  WHERE r.to_component_id = ?
  ORDER BY r.strength DESC, c.level;',
 'Find what depends on a component (blast radius)'),

('get_epic_architecture',
 'Get all components in an epic',
 'SELECT component_id, name, level, status, health, test_coverage
  FROM architecture_components
  WHERE epic_id = ?
  ORDER BY level, name;',
 'View all architecture for an epic'),

('get_failing_components',
 'Find all components with issues',
 'SELECT component_id, name, level, health, status, epic_id, last_verified_at
  FROM architecture_components
  WHERE health IN (''failing'', ''degraded'') OR status = ''deprecated''
  ORDER BY health DESC, level;',
 'Find components needing attention'),

('get_recent_changes',
 'Get recent architecture changes',
 'SELECT ac.component_id, c.name, ac.change_type, ac.description, ac.changed_at, ac.task_id
  FROM architecture_changes ac
  JOIN architecture_components c ON ac.component_id = c.component_id
  ORDER BY ac.changed_at DESC
  LIMIT 50;',
 'See what changed recently'),

('get_untested_components',
 'Find components with low test coverage',
 'SELECT component_id, name, level, test_coverage, epic_id
  FROM architecture_components
  WHERE test_coverage < 80 OR test_coverage IS NULL
  ORDER BY test_coverage NULLS LAST, level;',
 'Find components needing tests'),

('get_cross_epic_dependencies',
 'Find dependencies across epic boundaries',
 'SELECT
    c1.component_id as from_component,
    c1.name as from_name,
    c1.epic_id as from_epic,
    c2.component_id as to_component,
    c2.name as to_name,
    c2.epic_id as to_epic,
    r.relationship_type,
    r.strength
  FROM architecture_relationships r
  JOIN architecture_components c1 ON r.from_component_id = c1.component_id
  JOIN architecture_components c2 ON r.to_component_id = c2.component_id
  WHERE c1.epic_id != c2.epic_id
  ORDER BY r.strength DESC;',
 'Find coupling between epics');
