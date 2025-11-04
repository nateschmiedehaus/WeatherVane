import { promises as fs } from 'node:fs';
import path from 'node:path';

interface DeltaNote {
  taskId: string;
  timestamp: string;
  phase: string;
  summary: string;
  owner?: string;
  status: string;
  filePath: string;
}

const MONITOR_PLAN = /state\/evidence\/([^/]+)\/monitor\/plan\.md$/;
const DELTA_SECTION = /^## Delta Notes/m;
const NOTE_LINE = /^-\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\s+—\s+([^—]+)—\s*(.+?)\.\s*Owner:\s*([^()]+)(?:\s*\(([^)]+)\))?\.?$/;

async function findFiles(root: string): Promise<string[]> {
  const results: string[] = [];
  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && MONITOR_PLAN.test(full)) {
        results.push(full);
      }
    }
  }
  await walk(root);
  return results;
}

function parseDeltaNotes(taskId: string, filePath: string, content: string): DeltaNote[] {
  if (!DELTA_SECTION.test(content)) {
    return [];
  }
  const lines = content.split('\n');
  const notes: DeltaNote[] = [];
  for (const line of lines) {
    if (!line.trim().startsWith('-')) continue;
    const match = line.match(/^\-\s*(.+)$/);
    if (!match) continue;
    const body = match[1].trim();
    // Attempt to parse general structure: timestamp — phase — summary. Owner: name (status).
    const ownerMatch = body.match(/Owner:\s*([^()]+)(?:\s*\(([^)]+)\))?/);
    let owner: string | undefined;
    let status = 'pending';
    let main = body;
    if (ownerMatch) {
      owner = ownerMatch[1].trim();
      if (ownerMatch[2]) {
        status = ownerMatch[2].trim().toLowerCase();
      } else if (body.includes('(complete)')) {
        status = 'complete';
      }
      const ownerStart = ownerMatch.index ?? body.length;
      main = body.slice(0, ownerStart).trim();
    } else if (body.includes('(complete)')) {
      status = 'complete';
    }
    const parts = main.split('—').map(s => s.trim()).filter(Boolean);
    if (parts.length < 3) {
      continue;
    }
    const [timestamp, phase, summary] = parts;
    notes.push({ taskId, timestamp, phase, summary, owner, status, filePath });
  }
  return notes;
}

async function main() {
  const root = process.cwd();
  const files = await findFiles(root);
  const allNotes: DeltaNote[] = [];
  for (const file of files) {
    const taskMatch = file.match(MONITOR_PLAN);
    if (!taskMatch) continue;
    const taskId = taskMatch[1];
    const content = await fs.readFile(file, 'utf-8');
    const notes = parseDeltaNotes(taskId, file, content);
    allNotes.push(...notes);
  }

  const unresolved = allNotes.filter(n => n.status !== 'complete' && n.status !== 'completed');

  const report = {
    notes: allNotes,
    unresolved,
    summary: {
      totalTaskCount: new Set(allNotes.map(n => n.taskId)).size,
      totalNotes: allNotes.length,
      unresolvedCount: unresolved.length,
    },
  };

  await fs.mkdir('state/automation', { recursive: true });
  await fs.writeFile('state/automation/delta_notes_report.json', JSON.stringify(report, null, 2));

  if (unresolved.length > 0) {
    console.error('Unresolved delta notes detected:', unresolved.length);
    for (const note of unresolved) {
      console.error(`- ${note.taskId} :: ${note.summary} [${note.status}] @ ${note.filePath}`);
    }
    process.exitCode = 1;
  } else {
    console.log('No unresolved delta notes.');
  }
}

main().catch(err => {
  console.error('Failed to check delta notes', err);
  process.exitCode = 1;
});
