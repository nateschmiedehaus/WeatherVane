import { promises as fs } from 'node:fs';
import path from 'node:path';

interface TeamPanelEntry {
  assumptions: string[];
  openQuestions: string[];
  spikes: string[];
}

export async function updateTeamPanel(workspaceRoot: string, runId: string, entry: TeamPanelEntry): Promise<boolean> {
  const journalPath = path.join(workspaceRoot, 'resources', 'runs', runId, 'journal.md');
  const lines: string[] = [
    '### Team Panel',
    '**Assumptions**',
    ...entry.assumptions.map(item => `- ${item}`),
    '**Open Questions**',
    ...entry.openQuestions.map(item => `- ${item}`),
    '**Proposed Spikes**',
    ...entry.spikes.map(item => `- ${item}`),
    '',
  ];
  await fs.appendFile(journalPath, `${lines.join('\n')}\n`);
  return true;
}

export interface HandoffPackage {
  from: string;
  to: string;
  task_id: string;
  diff_refs: string[];
  evidence: string[];
  risks: string[];
  notes: string;
}

export async function writeHandoffPackage(workspaceRoot: string, runId: string, handoff: HandoffPackage): Promise<string> {
  const destDir = path.join(workspaceRoot, 'resources', 'runs', runId, 'handoff');
  await fs.mkdir(destDir, { recursive: true });
  const fileName = `${handoff.from}→${handoff.to}.json`;
  const destPath = path.join(destDir, fileName);
  await fs.writeFile(destPath, JSON.stringify(handoff, null, 2));
  return `resources://runs/${runId}/handoff/${fileName}`;
}
