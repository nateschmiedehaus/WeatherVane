import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { logInfo, logWarning } from '../telemetry/logger.js';
import { resolveStateRoot } from '../utils/config.js';
import { RealMCPClient, type ChatRequest } from './real_mcp_client.js';
import { detectTemplate, type TemplateDetectorResult } from '../critics/template_detector.js';
import { writePhaseKpis } from '../telemetry/kpi_writer.js';
import { performance } from 'node:perf_hooks';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  dependencies?: string[];
  set_id?: string;
}

export type PhaseContext = Record<string, string | undefined>;

export interface PhaseExecutionOptions {
  phase: string;
  task: Task;
  context: PhaseContext;
  prompt: string;
  drqcCitations?: Array<Record<string, any>>;
  concordance?: Array<Record<string, any>>;
  contentTransform?: (content: string) => string | Promise<string>;
  planCitations?: Array<Record<string, any>>;
}

export interface PhaseRunResult {
  content: string;
  transcriptPath: string;
  transcriptSha256: string;
  provider: string;
  template: TemplateDetectorResult;
}

const BASE_PROMPT = `ROLE: Phase Executor (Strict)
DOCTRINE: DRQC (evidence, live-fire, cited plans, gates) · AFP 10-phase · SCAS (bounded change, feedback)
ABSOLUTES:
- No templates or boilerplate. If the model cannot produce grounded content, STOP with a blocking note.
- Use ReAct (Think → Act → Observe) with a max of 8 loops; include tool traces in transcript.
- Apply Self-Consistency (3 mini plans, pick best), then Reflexion (self-critique before final answer).
- Reference DRQC quotes (“If it’s not in the ledger…”; “Always run the program…”; “Goal-locked, plan-flexible…”) and cite them.
- Output must begin with YAML frontmatter including drqc_citations, concordance, transcript_sha256, provider.`;

function getWorkspaceRoot(): string {
  return process.cwd();
}

function getStateRoot(): string {
  return resolveStateRoot(getWorkspaceRoot());
}

function resolveTranscriptPath(taskId: string, phase: string): string {
  return path.join(getStateRoot(), 'logs', taskId, 'phase', `${phase}.jsonl`);
}

function resolveVerifyDir(taskId: string): string {
  return path.join(getStateRoot(), 'logs', taskId, 'verify');
}

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

async function writeJSON(filePath: string, data: unknown): Promise<void> {
  ensureDir(path.dirname(filePath));
  await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function saveTranscript(taskId: string, phase: string, record: Record<string, unknown>): { path: string; sha256: string } {
  const transcriptDir = path.dirname(resolveTranscriptPath(taskId, phase));
  ensureDir(transcriptDir);

  const payload = JSON.stringify(record);
  const sha = crypto.createHash('sha256').update(payload).digest('hex');
  const line = JSON.stringify({ ...record, sha256: sha }) + '\n';
  fs.appendFileSync(resolveTranscriptPath(taskId, phase), line, 'utf-8');
  return { path: resolveTranscriptPath(taskId, phase), sha256: sha };
}

function normalizeForIdempotency(content: string): string {
  return content.replace(/timestamp: .*/gi, '').replace(/\d{4}-\d{2}-\d{2}T[^\n]+/g, '').trim();
}

async function enforceIdempotency(taskId: string, phase: string, content: string): Promise<void> {
  const verifyDir = resolveVerifyDir(taskId);
  ensureDir(verifyDir);
  const filePath = path.join(verifyDir, 'idempotency.json');
  const normalized = normalizeForIdempotency(content);
  const nextHash = crypto.createHash('sha256').update(normalized).digest('hex');
  const data = fs.existsSync(filePath)
    ? JSON.parse(await fs.promises.readFile(filePath, 'utf-8'))
    : {};
  const previousHash = data[phase];
  if (previousHash && previousHash !== nextHash) {
    throw new Error(`Idempotency mismatch for ${phase}: expected ${previousHash}, got ${nextHash}`);
  }
  data[phase] = nextHash;
  await writeJSON(filePath, data);
}

function buildFrontmatter(options: PhaseExecutionOptions, transcriptSha: string, provider: string): string {
  const citations = options.drqcCitations ?? [
    {
      page: 1,
      section: 'First principles',
      quote: "If it's not in the ledger, it didn't happen."
    }
  ];
  const concordance = options.concordance ?? [
    {
      action: `Executed ${options.phase} with transcript-first policy`,
      citation: 'DRQC p.1 ledger principle',
      artifact: `state/logs/${options.task.id}/phase/${options.phase}.jsonl`
    }
  ];

  const base: Record<string, unknown> = {
    phase: options.phase,
    task_id: options.task.id,
    timestamp: new Date().toISOString(),
    drqc_citations: citations,
    concordance,
    transcript_sha256: transcriptSha,
    provider
  };

  if (options.planCitations && options.planCitations.length > 0) {
    base.citations = options.planCitations;
  }

  const lines = Object.entries(base)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        const serialized = value
          .map((entry) => JSON.stringify(entry, null, 2).split('\n').map((line) => `  ${line}`).join('\n'))
          .join('\n');
        return `${key}:\n${serialized}`;
      }
      return `${key}: ${value}`;
    })
    .join('\n');

  return `---\n${lines}\n---\n\n`;
}

async function logTemplateDetection(taskId: string, phase: string, result: TemplateDetectorResult): Promise<void> {
  const verifyDir = resolveVerifyDir(taskId);
  ensureDir(verifyDir);
  const outPath = path.join(verifyDir, `template_${phase}.json`);
  await writeJSON(outPath, {
    phase,
    score: result.score,
    reasons: result.reasons,
    metrics: result.metrics,
    timestamp: new Date().toISOString()
  });
}

export class PhaseExecutionManager {
  private llmClient: RealMCPClient | null = null;

  private async ensureClient(): Promise<RealMCPClient> {
    if (!this.llmClient) {
      this.llmClient = new RealMCPClient();
      await this.llmClient.initialize();
    }
    return this.llmClient;
  }

  async runPhase(options: PhaseExecutionOptions): Promise<PhaseRunResult> {
    const phaseStart = performance.now();
    const llm = await this.ensureClient();
    const contextPreview = Object.entries(options.context)
      .filter(([, value]) => value)
      .map(([k, value]) => `${k.toUpperCase()}: ${(value ?? '').substring(0, 500)}`)
      .join('\n');

    const fullPrompt = `${BASE_PROMPT}

PHASE: ${options.phase.toUpperCase()}
TASK: ${options.task.id} — ${options.task.title}
${options.task.description ? `DESCRIPTION: ${options.task.description}\n` : ''}

${options.prompt}

CONTEXT:
${contextPreview || 'No prior phase context yet.'}
`;

    const request: ChatRequest = {
      messages: [{ role: 'user', content: fullPrompt }],
      tools: ['read_file', 'list_dir', 'grep', 'glob'],
      temperature: 0.4,
      max_tokens: 3500
    };

    const response = await llm.chat(request);
    const provider = response.provider || 'stub';
    const isCI = process.env.CI === 'true';
    const offlineAllowed = process.env.OFFLINE_OK === '1' && !isCI;
    if (provider === 'stub') {
      throw new Error(`Provider returned 'stub' for ${options.phase}; configure a real provider before continuing.`);
    }
    if (provider === 'offline-sim' && !offlineAllowed) {
      throw new Error(
        `Provider returned 'offline-sim' for ${options.phase}; set OFFLINE_OK=1 for local dev or rerun against a real MCP provider.`,
      );
    }

    const transcriptRecord = {
      phase: options.phase,
      task_id: options.task.id,
      timestamp: new Date().toISOString(),
      provider,
      request,
      response
    };
    const { path: transcriptPath, sha256: transcriptSha } = saveTranscript(options.task.id, options.phase, transcriptRecord);

    const rawContent = response.content ?? '';
    const transformedBody = options.contentTransform ? await options.contentTransform(rawContent.trim()) : rawContent.trim();
    const frontmatter = buildFrontmatter(options, transcriptSha, provider);
    const fullContent = `${frontmatter}${transformedBody}\n`;

    const templateResult = detectTemplate(fullContent, options.task.id, options.phase);
    await logTemplateDetection(options.task.id, options.phase, templateResult);
    if (templateResult.isTemplate) {
      throw new Error(`TemplateDetector flagged ${options.phase}: ${templateResult.reasons.join('; ')}`);
    }

    await enforceIdempotency(options.task.id, options.phase, fullContent);

    logInfo(`Phase ${options.phase} completed with provider=${provider} score=${templateResult.score.toFixed(2)}`);

    await writePhaseKpis(getWorkspaceRoot(), options.task.id, options.phase, {
      mcp_calls: 1,
      kb_hits: options.planCitations ? options.planCitations.length : 0,
      tokens: null,
      time_ms: Math.round(performance.now() - phaseStart),
      coverage: null,
      mutation_score: null,
      pbt_present: null,
      sgat_present: null,
    });

    return {
      content: fullContent,
      transcriptPath,
      transcriptSha256: transcriptSha,
      provider,
      template: templateResult
    };
  }
}
