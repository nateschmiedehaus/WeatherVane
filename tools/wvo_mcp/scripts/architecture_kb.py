#!/usr/bin/env python3
"""
Architecture Knowledge Base Management

Provides CLI for managing architectural documentation in SQLite database.
Better than scattered markdown files for hierarchical/relational architecture.
"""

import sqlite3
import json
import sys
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any

# Database path
DB_PATH = Path(__file__).parent.parent.parent.parent / "state" / "architecture.db"

class ArchitectureKB:
    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self.conn = None

    def connect(self):
        """Connect to database, creating if needed"""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(self.db_path))
        self.conn.row_factory = sqlite3.Row

    def init_schema(self):
        """Initialize database schema"""
        schema_path = Path(__file__).parent / "init_architecture_db.sql"
        with open(schema_path) as f:
            self.conn.executescript(f.read())
        self.conn.commit()
        print(f"✓ Initialized architecture database: {self.db_path}")

    def add_component(
        self,
        component_id: str,
        name: str,
        level: str,
        description: str,
        parent_id: Optional[str] = None,
        epic_id: Optional[str] = None,
        **kwargs
    ) -> str:
        """Add or update architecture component"""
        cursor = self.conn.cursor()

        # Check if exists
        exists = cursor.execute(
            "SELECT component_id FROM architecture_components WHERE component_id = ?",
            (component_id,)
        ).fetchone()

        if exists:
            # Update
            cursor.execute("""
                UPDATE architecture_components
                SET name = ?, level = ?, description = ?, parent_id = ?,
                    epic_id = ?, updated_at = CURRENT_TIMESTAMP
                WHERE component_id = ?
            """, (name, level, description, parent_id, epic_id, component_id))

            # Log change
            self.log_change(component_id, 'modified', f'Updated {name}')
            print(f"✓ Updated: {component_id}")
        else:
            # Insert
            cursor.execute("""
                INSERT INTO architecture_components
                (component_id, name, level, description, parent_id, epic_id,
                 purpose, responsibilities, language, entry_point, domain, status, health)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                component_id, name, level, description, parent_id, epic_id,
                kwargs.get('purpose'), kwargs.get('responsibilities'),
                kwargs.get('language'), kwargs.get('entry_point'),
                kwargs.get('domain'), kwargs.get('status', 'active'),
                kwargs.get('health', 'unknown')
            ))

            # Log change
            self.log_change(component_id, 'created', f'Created {name}')
            print(f"✓ Created: {component_id}")

        self.conn.commit()
        return component_id

    def add_relationship(
        self,
        from_id: str,
        to_id: str,
        rel_type: str,
        description: str = "",
        strength: str = "normal"
    ):
        """Add relationship between components"""
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT OR IGNORE INTO architecture_relationships
            (from_component_id, to_component_id, relationship_type, description, strength)
            VALUES (?, ?, ?, ?, ?)
        """, (from_id, to_id, rel_type, description, strength))
        self.conn.commit()
        print(f"✓ Relationship: {from_id} --{rel_type}--> {to_id}")

    def log_change(
        self,
        component_id: str,
        change_type: str,
        description: str,
        task_id: Optional[str] = None
    ):
        """Log architecture change"""
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO architecture_changes
            (component_id, change_type, description, task_id, changed_by)
            VALUES (?, ?, ?, ?, ?)
        """, (component_id, change_type, description, task_id, 'architecture_kb.py'))
        self.conn.commit()

    def get_hierarchy(self, component_id: str) -> List[Dict]:
        """Get component hierarchy"""
        cursor = self.conn.cursor()

        # Get ancestors
        query = """
            WITH RECURSIVE ancestors AS (
                SELECT component_id, name, level, parent_id, 0 as depth
                FROM architecture_components
                WHERE component_id = ?

                UNION ALL

                SELECT c.component_id, c.name, c.level, c.parent_id, a.depth - 1
                FROM architecture_components c
                JOIN ancestors a ON c.component_id = a.parent_id
            )
            SELECT * FROM ancestors
            UNION
            WITH RECURSIVE descendants AS (
                SELECT component_id, name, level, parent_id, 0 as depth
                FROM architecture_components
                WHERE component_id = ?

                UNION ALL

                SELECT c.component_id, c.name, c.level, c.parent_id, d.depth + 1
                FROM architecture_components c
                JOIN descendants d ON c.parent_id = d.component_id
            )
            SELECT * FROM descendants WHERE depth > 0
            ORDER BY depth, name;
        """

        results = cursor.execute(query, (component_id, component_id)).fetchall()
        return [dict(row) for row in results]

    def get_dependencies(self, component_id: str) -> List[Dict]:
        """Get what this component depends on"""
        cursor = self.conn.cursor()
        results = cursor.execute("""
            SELECT
                r.to_component_id as component_id,
                c.name,
                c.level,
                r.relationship_type,
                r.strength,
                r.description
            FROM architecture_relationships r
            JOIN architecture_components c ON r.to_component_id = c.component_id
            WHERE r.from_component_id = ?
            ORDER BY
                CASE r.strength
                    WHEN 'critical' THEN 1
                    WHEN 'strong' THEN 2
                    WHEN 'normal' THEN 3
                    WHEN 'weak' THEN 4
                END,
                c.level
        """, (component_id,)).fetchall()

        return [dict(row) for row in results]

    def get_dependents(self, component_id: str) -> List[Dict]:
        """Get what depends on this component (blast radius)"""
        cursor = self.conn.cursor()
        results = cursor.execute("""
            SELECT
                r.from_component_id as component_id,
                c.name,
                c.level,
                r.relationship_type,
                r.strength,
                r.description
            FROM architecture_relationships r
            JOIN architecture_components c ON r.from_component_id = c.component_id
            WHERE r.to_component_id = ?
            ORDER BY
                CASE r.strength
                    WHEN 'critical' THEN 1
                    WHEN 'strong' THEN 2
                    WHEN 'normal' THEN 3
                    WHEN 'weak' THEN 4
                END,
                c.level
        """, (component_id,)).fetchall()

        return [dict(row) for row in results]

    def search(self, query: str) -> List[Dict]:
        """Search components"""
        cursor = self.conn.cursor()
        results = cursor.execute("""
            SELECT component_id, name, level, description, epic_id, status, health
            FROM architecture_components
            WHERE
                name LIKE ? OR
                description LIKE ? OR
                component_id LIKE ?
            ORDER BY level, name
            LIMIT 50
        """, (f"%{query}%", f"%{query}%", f"%{query}%")).fetchall()

        return [dict(row) for row in results]

    def get_epic_architecture(self, epic_id: str) -> List[Dict]:
        """Get all architecture for an epic"""
        cursor = self.conn.cursor()
        results = cursor.execute("""
            SELECT component_id, name, level, description, status, health, test_coverage
            FROM architecture_components
            WHERE epic_id = ?
            ORDER BY
                CASE level
                    WHEN 'system' THEN 1
                    WHEN 'subsystem' THEN 2
                    WHEN 'component' THEN 3
                    WHEN 'module' THEN 4
                    WHEN 'function' THEN 5
                END,
                name
        """, (epic_id,)).fetchall()

        return [dict(row) for row in results]

    def get_health_report(self) -> Dict:
        """Get overall architecture health"""
        cursor = self.conn.cursor()

        total = cursor.execute("SELECT COUNT(*) FROM architecture_components WHERE status = 'active'").fetchone()[0]
        by_health = cursor.execute("""
            SELECT health, COUNT(*) as count
            FROM architecture_components
            WHERE status = 'active'
            GROUP BY health
        """).fetchall()

        by_level = cursor.execute("""
            SELECT level, COUNT(*) as count
            FROM architecture_components
            WHERE status = 'active'
            GROUP BY level
        """).fetchall()

        low_coverage = cursor.execute("""
            SELECT COUNT(*) FROM architecture_components
            WHERE (test_coverage < 80 OR test_coverage IS NULL) AND status = 'active'
        """).fetchone()[0]

        return {
            'total_components': total,
            'by_health': {row['health']: row['count'] for row in by_health},
            'by_level': {row['level']: row['count'] for row in by_level},
            'low_coverage_count': low_coverage
        }

    def export_component(self, component_id: str) -> Dict:
        """Export component with all relationships"""
        cursor = self.conn.cursor()

        # Get component
        component = cursor.execute(
            "SELECT * FROM architecture_components WHERE component_id = ?",
            (component_id,)
        ).fetchone()

        if not component:
            return {}

        # Get relationships
        dependencies = self.get_dependencies(component_id)
        dependents = self.get_dependents(component_id)
        hierarchy = self.get_hierarchy(component_id)

        return {
            'component': dict(component),
            'dependencies': dependencies,
            'dependents': dependents,
            'hierarchy': hierarchy
        }

    def close(self):
        if self.conn:
            self.conn.close()

def main():
    import argparse

    parser = argparse.ArgumentParser(description="Architecture Knowledge Base CLI")
    subparsers = parser.add_subparsers(dest='command', help='Commands')

    # Init
    subparsers.add_parser('init', help='Initialize database')

    # Add component
    add_parser = subparsers.add_parser('add', help='Add component')
    add_parser.add_argument('component_id')
    add_parser.add_argument('name')
    add_parser.add_argument('level', choices=['system', 'epic', 'subsystem', 'component', 'module', 'function'])
    add_parser.add_argument('--description', default='')
    add_parser.add_argument('--parent')
    add_parser.add_argument('--epic')

    # Search
    search_parser = subparsers.add_parser('search', help='Search components')
    search_parser.add_argument('query')

    # Get
    get_parser = subparsers.add_parser('get', help='Get component details')
    get_parser.add_argument('component_id')

    # Health
    subparsers.add_parser('health', help='Get health report')

    args = parser.parse_args()

    kb = ArchitectureKB()
    kb.connect()

    try:
        if args.command == 'init':
            kb.init_schema()

        elif args.command == 'add':
            kb.add_component(
                args.component_id,
                args.name,
                args.level,
                args.description,
                args.parent,
                args.epic
            )

        elif args.command == 'search':
            results = kb.search(args.query)
            print(f"\nFound {len(results)} components:\n")
            for r in results:
                print(f"{r['component_id']:20s} {r['level']:10s} {r['name']}")

        elif args.command == 'get':
            data = kb.export_component(args.component_id)
            print(json.dumps(data, indent=2))

        elif args.command == 'health':
            report = kb.get_health_report()
            print(json.dumps(report, indent=2))

        else:
            parser.print_help()

    finally:
        kb.close()

if __name__ == '__main__':
    main()
