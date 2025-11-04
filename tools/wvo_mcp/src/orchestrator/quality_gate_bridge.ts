import type { TaskEvidence } from './adversarial_bullshit_detector.js';
import type { ImplementerAgentResult } from './implementer_agent.js';
import type { Task } from './state_machine.js';
import type { VerifierResult, GateResult } from './verifier.js';

const DOC_PATTERN = /(^(docs|docs\/)|\.md$|\.rst$|\/README\.md$)/i;

export interface MonitorArtifact {
  smoke?: {
    success: boolean;
    log: string;
  };
}

export interface QualityGateArtifacts {
  implement?: ImplementerAgentResult;
  verify?: VerifierResult;
  monitor?: MonitorArtifact;
}

export function buildTaskEvidenceFromArtifacts(
  task: Task,
  artifacts: QualityGateArtifacts
): TaskEvidence | null {
  const implement = artifacts.implement;
  const verify = artifacts.verify;
  if (!implement || !verify) {
    return null;
  }

  const gateSummary = summarizeGates(verify.gateResults);
  const changedFiles = (implement.changedFiles ?? []).map(file => file.path);
  const testFiles = (implement.changedFiles ?? [])
    .filter(file => file.isTestFile ?? /test|spec/iu.test(file.path))
    .map(file => file.path);
  const documentation = (implement.changedFiles ?? [])
    .map(file => file.path)
    .filter(path => !!path && DOC_PATTERN.test(path));

  const runtimeEvidence = artifacts.monitor?.smoke
    ? [
        {
          type: 'cli_output' as const,
          path: 'monitor/app_smoke_e2e.log',
          content: artifacts.monitor.smoke.log,
        },
      ]
    : undefined;

  return {
    taskId: task.id,
    title: task.title,
    description: task.description ?? '',
    buildOutput: gateSummary.buildOutput,
    testOutput: gateSummary.testOutput,
    documentation,
    changedFiles,
    testFiles,
    runtimeEvidence,
  };
}

function summarizeGates(gates: GateResult[]): { buildOutput: string; testOutput: string } {
  const outputs = new Map<string, string>();
  for (const gate of gates) {
    outputs.set(gate.name, gate.output);
  }

  const buildGateOrder = ['lint.run', 'typecheck.run', 'security.scan', 'license.check'];
  const buildOutputParts = buildGateOrder
    .map(name => (outputs.has(name) ? `${name}: ${outputs.get(name)}` : undefined))
    .filter((value): value is string => Boolean(value));
  const buildOutput = buildOutputParts.join('\n\n') || 'No build artifacts captured';

  const testOutput = outputs.get('tests.run') ?? 'tests.run was not executed';

  return { buildOutput, testOutput };
}
