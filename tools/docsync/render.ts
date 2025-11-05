import crypto from 'node:crypto';
import path from 'node:path';
import { DirectoryEntry, DirectoryMetrics, MetricWarning, MetricWarningRecord } from './types.js';

export const AUTO_SECTION_START = '<!-- BEGIN DOCSYNC -->';
export const AUTO_SECTION_END = '<!-- END DOCSYNC -->';

export function renderReadme(
  entry: DirectoryEntry,
  warnings: MetricWarningRecord[],
  generatedAt: string,
) {
  const generatedBlock = [
    `## Local Knowledge (generated ${generatedAt})`,
    '',
    renderHierarchy(entry),
    '',
    renderSummary(entry),
    '',
    renderKeyFiles(entry),
    '',
    renderDependencies(entry),
    '',
    renderGuardrails(entry.metrics),
    '',
    renderCriticalEvaluation(entry, warnings),
  ]
    .join('\n')
    .trim();

  const autoSection = `${AUTO_SECTION_START}\n\n${generatedBlock}\n\n${AUTO_SECTION_END}`;

  const base = entry.hasReadme ? entry.files.find((file) => file.name === 'README.md')?.content : undefined;
  const existing = base ? base : (entry.hasReadme ? '' : '');
  let nextContent: string;
  if (existing && existing.includes(AUTO_SECTION_START) && existing.includes(AUTO_SECTION_END)) {
    nextContent = existing.replace(
      new RegExp(`${AUTO_SECTION_START}[\s\S]*?${AUTO_SECTION_END}`),
      autoSection,
    );
  } else if (existing && existing.length > 0) {
    nextContent = `${existing}\n\n${autoSection}\n`;
  } else {
    nextContent = `# ${entry.name}\n\n${autoSection}\n`;
  }

  return {
    content: nextContent,
    digest: computeDigest(generatedBlock),
  };
}

function renderSummary(entry: DirectoryEntry): string {
  const summary = [
    '**What it is:**',
    `- Path: \`${entry.path}\``,
    `- Languages: ${formatHistogram(entry.metrics.languageHistogram)}`,
    `- Children: ${entry.childDirectories.length}`,
    `- Files: ${entry.files.length}`,
  ];
  return summary.join('\n');
}

function renderHierarchy(entry: DirectoryEntry): string {
  const parent = !entry.parent || entry.parent === '.' ? 'root' : `\`${entry.parent}\``;
  const children = entry.childDirectories
    .map((dir) => dir.replace(/\\/g, '/'))
    .slice(0, 5)
    .map((dir) => {
      const name = path.basename(dir);
      return `  - \`${dir}\` (${name})`;
    });
  return [
    '**Hierarchy:**',
    `- Parent: ${parent}`,
    children.length > 0 ? '- Key children:' : '- Key children: none',
    ...(children.length > 0 ? children : []),
  ].join('\n');
}

function renderKeyFiles(entry: DirectoryEntry): string {
  const top = entry.files
    .filter((file) => file.name !== 'README.md')
    .sort((a, b) => b.size - a.size)
    .slice(0, 5)
    .map((file) => `- \`${file.name}\` (${prettyBytes(file.size)})`);
  return ['**Key files:**', ...(top.length ? top : ['- n/a'])].join('\n');
}

function renderDependencies(entry: DirectoryEntry): string {
  const upstream = [...entry.metrics.importTargets].sort((a, b) => a.localeCompare(b));
  const downstream = [...entry.metrics.downstreamConsumers].sort((a, b) => a.localeCompare(b));
  return [
    '**Upstream dependencies:**',
    ...(upstream.length ? upstream.map((d) => `- \`${d}\``) : ['- none detected']),
    '',
    '**Downstream consumers:**',
    ...(downstream.length ? downstream.map((d) => `- \`${d}\``) : ['- none detected']),
  ].join('\n');
}

function renderGuardrails(metrics: DirectoryMetrics): string {
  return [
    '**Guardrails & tests:**',
    `- Test files: ${metrics.testFileCount}`,
    `- Critic configs: ${metrics.criticFileCount}`,
    `- TODO/FIXME markers: ${metrics.todoCount}`,
    '',
    '**AFP/SCAS summary (5 = healthy):**',
    `- Coherence: ${metrics.summary.coherenceScore.toFixed(1)}`,
    `- Economy/Via Negativa: ${metrics.summary.economyScore.toFixed(1)}`,
    `- Locality: ${metrics.summary.localityScore.toFixed(1)}`,
    `- Visibility: ${metrics.summary.visibilityScore.toFixed(1)}`,
    `- Evolution: ${metrics.summary.evolutionScore.toFixed(1)}`,
  ].join('\n');
}

function renderCriticalEvaluation(entry: DirectoryEntry, records: MetricWarningRecord[]): string {
  const record = records.find((r) => r.directory === entry.path);
  if (!record || record.warnings.length === 0) {
    return '**Critical evaluation:**\n- ✅ Healthy — no outstanding structural risks detected.';
  }
  const lines = record.warnings.map(renderWarning);
  return ['**Critical evaluation:**', ...lines].join('\n');
}

function renderWarning(warning: MetricWarning): string {
  const emoji = warning.severity === 'high' ? '❌' : warning.severity === 'medium' ? '⚠️' : 'ℹ️';
  return `- ${emoji} (${warning.force}) ${warning.message}${warning.recommendation ? `\n  - Recommendation: ${warning.recommendation}` : ''}`;
}

export function summarizeWarnings(records: MetricWarningRecord[]): string {
  if (records.length === 0) {
    return 'No structural warnings detected.';
  }
  return records
    .map((record) => `- ${record.directory}: ${record.warnings.map((w) => `${w.force}/${w.severity}`).join(', ')}`)
    .join('\n');
}

export function extractExistingDigest(content: string): string | null {
  const start = content.indexOf(AUTO_SECTION_START);
  const end = content.indexOf(AUTO_SECTION_END);
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  const section = content
    .slice(start + AUTO_SECTION_START.length, end)
    .trim();
  if (!section) {
    return null;
  }
  return computeDigest(section);
}

function computeDigest(value: string): string {
  return crypto.createHash('sha1').update(value).digest('hex');
}

function formatHistogram(histogram: Record<string, number>): string {
  const entries = Object.entries(histogram)
    .filter(([ext]) => ext !== '.md')
    .sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return 'n/a';
  }
  return entries.map(([ext, count]) => `${ext.replace('.', '') || 'unknown'} (${count})`).join(', ');
}

function prettyBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
