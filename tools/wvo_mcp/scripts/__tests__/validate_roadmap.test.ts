/**
 * ROADMAP-STRUCT Phase 2: Validation Script Tests
 *
 * Tests validation CLI functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseArgs, loadRoadmap, checkCircularDependencies, checkMissingReferences } from '../validate_roadmap.js';
import type { ValidationResult } from '../../src/roadmap/validators.js';
import type { RoadmapSchema } from '../../src/roadmap/schemas.js';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

describe('Validation Script', () => {
  beforeEach(() => {
    // Create fixtures directory
    if (!fs.existsSync(FIXTURES_DIR)) {
      fs.mkdirSync(FIXTURES_DIR, { recursive: true });
    }
  });

  describe('CLI Argument Parsing', () => {
    it('parses --file argument', () => {
      const args = parseArgs(['--file', 'test.yaml']);
      expect(args.file).toBe('test.yaml');
    });

    it('parses --json flag', () => {
      const args = parseArgs(['--json']);
      expect(args.json).toBe(true);
    });

    it('parses --help flag', () => {
      const args = parseArgs(['--help']);
      expect(args.help).toBe(true);
    });

    it('handles multiple arguments', () => {
      const args = parseArgs(['--file', 'test.yaml', '--json']);
      expect(args.file).toBe('test.yaml');
      expect(args.json).toBe(true);
    });
  });

  describe('Circular Dependency Detection', () => {
    it('detects simple cycle A→B→A', () => {
      const roadmap: RoadmapSchema = {
        schema_version: '2.0',
        epics: [{
          id: 'E-1',
          title: 'Test',
          domain: 'product',
          milestones: [{
            id: 'M-1',
            title: 'Test',
            tasks: [
              { id: 'A', title: 'A', status: 'pending', dependencies: { depends_on: ['B'] } },
              { id: 'B', title: 'B', status: 'pending', dependencies: { depends_on: ['A'] } }
            ]
          }]
        }]
      };

      const result: ValidationResult = { valid: true, errors: [], warnings: [] };
      checkCircularDependencies(roadmap, result);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'CIRCULAR_DEPENDENCY')).toBe(true);
    });

    it('detects no cycles in acyclic graph', () => {
      const roadmap: RoadmapSchema = {
        schema_version: '2.0',
        epics: [{
          id: 'E-1',
          title: 'Test',
          domain: 'product',
          milestones: [{
            id: 'M-1',
            title: 'Test',
            tasks: [
              { id: 'A', title: 'A', status: 'done' },
              { id: 'B', title: 'B', status: 'pending', dependencies: { depends_on: ['A'] } }
            ]
          }]
        }]
      };

      const result: ValidationResult = { valid: true, errors: [], warnings: [] };
      checkCircularDependencies(roadmap, result);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Missing References Detection', () => {
    it('detects missing task reference', () => {
      const roadmap: RoadmapSchema = {
        schema_version: '2.0',
        epics: [{
          id: 'E-1',
          title: 'Test',
          domain: 'product',
          milestones: [{
            id: 'M-1',
            title: 'Test',
            tasks: [
              { id: 'A', title: 'A', status: 'pending', dependencies: { depends_on: ['NON-EXISTENT'] } }
            ]
          }]
        }]
      };

      const result: ValidationResult = { valid: true, errors: [], warnings: [] };
      checkMissingReferences(roadmap, result);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_TASK_REFERENCE')).toBe(true);
      expect(result.errors.some(e => e.message.includes('NON-EXISTENT'))).toBe(true);
    });

    it('accepts valid references', () => {
      const roadmap: RoadmapSchema = {
        schema_version: '2.0',
        epics: [{
          id: 'E-1',
          title: 'Test',
          domain: 'product',
          milestones: [{
            id: 'M-1',
            title: 'Test',
            tasks: [
              { id: 'A', title: 'A', status: 'done' },
              { id: 'B', title: 'B', status: 'pending', dependencies: { depends_on: ['A'] } }
            ]
          }]
        }]
      };

      const result: ValidationResult = { valid: true, errors: [], warnings: [] };
      checkMissingReferences(roadmap, result);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty roadmap', () => {
      const roadmap: RoadmapSchema = {
        schema_version: '2.0',
        epics: []
      };

      const result: ValidationResult = { valid: true, errors: [], warnings: [] };
      checkCircularDependencies(roadmap, result);
      checkMissingReferences(roadmap, result);

      expect(result.valid).toBe(true);
    });

    it('handles roadmap with no dependencies', () => {
      const roadmap: RoadmapSchema = {
        schema_version: '2.0',
        epics: [{
          id: 'E-1',
          title: 'Test',
          domain: 'product',
          milestones: [{
            id: 'M-1',
            title: 'Test',
            tasks: [
              { id: 'A', title: 'A', status: 'pending' },
              { id: 'B', title: 'B', status: 'pending' }
            ]
          }]
        }]
      };

      const result: ValidationResult = { valid: true, errors: [], warnings: [] };
      checkCircularDependencies(roadmap, result);
      checkMissingReferences(roadmap, result);

      expect(result.valid).toBe(true);
    });
  });
});
