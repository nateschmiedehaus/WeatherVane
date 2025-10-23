/**
 * HistoricalContextRegistry - Curated catalog of prior architecture docs and experiments.
 *
 * Provides lightweight references so planners and reviewers can stay aware of
 * earlier attempts before proposing new directions.
 */

import path from 'node:path';
import type { Task } from './state_machine.js';

interface HistoricalEntry {
  id: string;
  path: string;
  summary: string;
  keywords: string[];
  domains?: string[];
}

const HISTORICAL_ENTRIES: HistoricalEntry[] = [
  {
    id: 'unified-autopilot-implementation',
    path: 'docs/UNIFIED_AUTOPILOT_IMPLEMENTATION.md',
    summary: 'Unified autopilot architecture overview, agent hierarchy, and operational lessons from the bash era.',
    keywords: ['autopilot', 'orchestrator', 'architecture', 'hierarchy'],
    domains: ['mcp', 'product'],
  },
  {
    id: 'multi-agent-charter',
    path: 'docs/orchestration/multi_agent_charter.md',
    summary: 'Role definitions for Atlas, Director Dana, critics, and how delegation meshes together.',
    keywords: ['charter', 'delegation', 'atlas', 'dana', 'critics'],
    domains: ['product', 'mcp'],
  },
  {
    id: 'web-design-system',
    path: 'docs/WEB_DESIGN_SYSTEM.md',
    summary: 'WeatherVane web experience design system, component library expectations, and UX standards.',
    keywords: ['web', 'design', 'system', 'components', 'ux'],
    domains: ['product', 'frontend'],
  },
  {
    id: 'model-router-implementation',
    path: 'docs/orchestration/MODEL_ROUTER_IMPLEMENTATION.md',
    summary: 'Claude-led model router implementation with telemetry and cost optimisation strategy.',
    keywords: ['model router', 'telemetry', 'cost', 'optimization'],
    domains: ['mcp', 'architecture'],
  },
  {
    id: 'web-inspiration',
    path: 'docs/WEB_INSPIRATION.md',
    summary: 'Historical website architecture explorations, inspiration sources, and prior UI spikes.',
    keywords: ['web', 'architecture', 'inspiration', 'layout'],
    domains: ['product', 'frontend'],
  },
];

function normalize(text: string | undefined): string {
  return (text ?? '').toLowerCase();
}

export interface HistoricalContextItem {
  path: string;
  summary: string;
}

export class HistoricalContextRegistry {
  getEntriesForTask(task: Task, limit = 4): HistoricalContextItem[] {
    const text = `${normalize(task.title)} ${normalize(task.description)}`;
    const domain = normalize((task.metadata as Record<string, unknown> | undefined)?.domain as string | undefined);

    const matches = HISTORICAL_ENTRIES.filter(entry => {
      const keywordHit = entry.keywords.some(keyword => text.includes(keyword));
      const domainHit = entry.domains ? entry.domains.some(d => domain.includes(d)) : false;

      // Strong hit if keyword match, fallback to domain affinity
      return keywordHit || domainHit || text.includes(normalize(path.basename(entry.path, '.md')));
    }).slice(0, limit);

    return matches.map(entry => ({
      path: entry.path,
      summary: entry.summary,
    }));
  }
}
