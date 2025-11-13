/**
 * AFP-W0-AGENT-SELF-ENFORCEMENT-20251107-REMEDIATION-V
 * Phase 13: EVALUATE - Multi-Strategy Evaluation Harness
 *
 * Evaluates stigmergic architecture through:
 * 1. Via Negativa (layer utility)
 * 2. Effectiveness (bypass detection)
 * 3. Performance (overhead, scalability)
 * 4. Emergent Properties (intelligent behavior)
 * 5. SCAS Compliance (20 commonalities)
 */

import { ScentEnvironment, ScentType, LayerName } from './scent_environment.js';
import { ConstitutionalLayer, EvidenceDocument } from './layer_1_constitutional.js';
import { DebiasLayer, TaskCompletion } from './layer_2_debiasing.js';
import { DetectionLayer } from './layer_3_detection.js';
import { RemediationLayer } from './layer_4_remediation.js';
import { ConsensusLayer } from './layer_5_consensus.js';
import { DocumentationLayer } from './layer_6_documentation.js';

// ============================================================================
// Test Scenarios
// ============================================================================

interface TestScenario {
  name: string;
  type: 'bypass' | 'control';
  bypassPattern?: string;
  document: EvidenceDocument;
  completion: TaskCompletion;
}

const SCENARIOS: TestScenario[] = [
  {
    name: 'BP001: Rushed Low-Quality Work',
    type: 'bypass',
    bypassPattern: 'BP001',
    document: {
      taskId: 'TEST-BP001',
      phase: 'strategize',
      path: 'state/evidence/TEST-BP001/strategize.md',
      wordCount: 150,
      sections: ['Problem']
    },
    completion: {
      taskId: 'TEST-BP001',
      phase: 'strategize',
      duration: 5,
      confidence: 95,
      complexity: 80
    }
  },
  {
    name: 'BP002: Template Evidence',
    type: 'bypass',
    bypassPattern: 'BP002',
    document: {
      taskId: 'TEST-BP002',
      phase: 'design',
      path: 'state/evidence/TEST-BP002/design.md',
      wordCount: 600,
      sections: ['Via Negativa', 'Alternatives', 'Complexity']
    },
    completion: {
      taskId: 'TEST-BP002',
      phase: 'design',
      duration: 30,
      confidence: 70,
      complexity: 50
    }
  },
  {
    name: 'CONTROL: High-Quality Work',
    type: 'control',
    document: {
      taskId: 'TEST-CONTROL',
      phase: 'plan',
      path: 'state/evidence/TEST-CONTROL/plan.md',
      wordCount: 800,
      sections: ['Approach', 'Files', 'LOC Estimate', 'Tests']
    },
    completion: {
      taskId: 'TEST-CONTROL',
      phase: 'plan',
      duration: 50,
      confidence: 75,
      complexity: 60
    }
  }
];

// ============================================================================
// Configuration Matrix
// ============================================================================

interface LayerConfig {
  name: string;
  L1: boolean; // Constitutional
  L2: boolean; // De-biasing
  L3: boolean; // Detection
  L4: boolean; // Remediation
  L5: boolean; // Consensus
  L6: boolean; // Documentation
  purpose: string;
}

const CONFIGS: LayerConfig[] = [
  { name: 'C1-Baseline', L1: true, L2: true, L3: true, L4: true, L5: true, L6: true, purpose: 'All layers' },
  { name: 'C2-NoConstitutional', L1: false, L2: true, L3: true, L4: true, L5: true, L6: true, purpose: 'No L1' },
  { name: 'C3-NoDebiasing', L1: true, L2: false, L3: true, L4: true, L5: true, L6: true, purpose: 'No L2' },
  { name: 'C4-NoDetection', L1: true, L2: true, L3: false, L4: true, L5: true, L6: true, purpose: 'No L3' },
  { name: 'C5-NoRemediation', L1: true, L2: true, L3: true, L4: false, L5: true, L6: true, purpose: 'No L4' },
  { name: 'C6-NoConsensus', L1: true, L2: true, L3: true, L4: true, L5: false, L6: true, purpose: 'No L5' },
  { name: 'C7-NoDocs', L1: true, L2: true, L3: true, L4: true, L5: true, L6: false, purpose: 'No L6' },
  { name: 'C8-MinimalL1L4', L1: true, L2: false, L3: false, L4: true, L5: false, L6: false, purpose: 'L1+L4 only' },
  { name: 'C9-MinimalL2L4', L1: false, L2: true, L3: false, L4: true, L5: false, L6: false, purpose: 'L2+L4 only' },
  { name: 'C10-DetectionOnly', L1: true, L2: true, L3: true, L4: false, L5: false, L6: false, purpose: 'No enforcement' },
  { name: 'C11-DirectRemediation', L1: true, L2: true, L3: false, L4: true, L5: false, L6: false, purpose: 'Skip detection' },
  { name: 'C12-NoDebiasing2', L1: true, L2: false, L3: true, L4: true, L5: false, L6: false, purpose: 'L1+L3+L4' },
  { name: 'C13-NoConstitutional2', L1: false, L2: true, L3: true, L4: true, L5: false, L6: false, purpose: 'L2+L3+L4' }
];

// ============================================================================
// Evaluation Results
// ============================================================================

interface EvaluationResult {
  config: string;
  scenario: string;
  bypassDetected: boolean;
  remediationCreated: boolean;
  scentCount: number;
  layerUtility: Record<LayerName, number>;
  executionTime: number; // ms
}

// ============================================================================
// Evaluator
// ============================================================================

class StigmergicEvaluator {
  private results: EvaluationResult[] = [];

  /**
   * Run via negativa evaluation.
   * Tests all 13 configurations × 3 scenarios = 39 runs.
   */
  async runViaNegativaEvaluation(): Promise<void> {
    console.log('=== Via Negativa Evaluation ===\n');
    console.log(`Running ${CONFIGS.length} configs × ${SCENARIOS.length} scenarios = ${CONFIGS.length * SCENARIOS.length} tests\n`);

    let testNum = 1;
    const totalTests = CONFIGS.length * SCENARIOS.length;

    for (const config of CONFIGS) {
      for (const scenario of SCENARIOS) {
        process.stdout.write(`[${testNum}/${totalTests}] ${config.name} × ${scenario.name}... `);

        const result = await this.runSingleTest(config, scenario);
        this.results.push(result);

        const status = scenario.type === 'bypass'
          ? (result.bypassDetected ? '✓' : '✗')
          : (!result.bypassDetected ? '✓' : '✗');

        console.log(`${status} (${result.executionTime}ms)`);
        testNum++;
      }
    }

    console.log('\n✓ Via negativa evaluation complete\n');
  }

  /**
   * Run single test with specific configuration and scenario.
   */
  private async runSingleTest(config: LayerConfig, scenario: TestScenario): Promise<EvaluationResult> {
    const startTime = Date.now();

    // Initialize environment
    const env = new ScentEnvironment();
    await env.bootstrap();

    // Initialize only enabled layers
    const layer1 = config.L1 ? new ConstitutionalLayer(env) : null;
    const layer2 = config.L2 ? new DebiasLayer(env) : null;
    const layer3 = config.L3 ? new DetectionLayer(env) : null;
    const layer4 = config.L4 ? new RemediationLayer(env) : null;
    const layer5 = config.L5 ? new ConsensusLayer(env) : null;
    const layer6 = config.L6 ? new DocumentationLayer(env) : null;

    // Run patrol cycles
    if (layer1) await layer1.patrol([scenario.document]);
    if (layer2) await layer2.patrol([scenario.completion]);
    await this.sleep(10);

    if (layer3) await layer3.patrol();
    await this.sleep(10);

    if (layer4) await layer4.patrol();
    await this.sleep(10);

    if (layer5) await layer5.patrol([scenario.document.taskId]);
    await this.sleep(10);

    if (layer6) await layer6.patrol();

    // Collect results
    const allScents = await env.detectScents({});
    const bypassDetected = allScents.some(s => s.type === ScentType.BYPASS_PATTERN);
    const remediationCreated = allScents.some(s => s.type === ScentType.REMEDIATION_CREATED);

    // Measure layer utility
    const layerUtility: Record<LayerName, number> = {
      [LayerName.L1_CONSTITUTIONAL]: config.L1 ? await env.measureLayerUtility(LayerName.L1_CONSTITUTIONAL) : 0,
      [LayerName.L2_DEBIASING]: config.L2 ? await env.measureLayerUtility(LayerName.L2_DEBIASING) : 0,
      [LayerName.L3_DETECTION]: config.L3 ? await env.measureLayerUtility(LayerName.L3_DETECTION) : 0,
      [LayerName.L4_REMEDIATION]: config.L4 ? await env.measureLayerUtility(LayerName.L4_REMEDIATION) : 0,
      [LayerName.L5_CONSENSUS]: config.L5 ? await env.measureLayerUtility(LayerName.L5_CONSENSUS) : 0,
      [LayerName.L6_DOCUMENTATION]: config.L6 ? await env.measureLayerUtility(LayerName.L6_DOCUMENTATION) : 0,
      [LayerName.BOOTSTRAP]: 0
    };

    const executionTime = Date.now() - startTime;

    // Cleanup
    env.destroy();

    return {
      config: config.name,
      scenario: scenario.name,
      bypassDetected,
      remediationCreated,
      scentCount: allScents.length,
      layerUtility,
      executionTime
    };
  }

  /**
   * Analyze via negativa results.
   */
  analyzeViaNegativa(): void {
    console.log('=== Via Negativa Analysis ===\n');

    // Group results by config
    const byConfig = new Map<string, EvaluationResult[]>();
    for (const result of this.results) {
      const existing = byConfig.get(result.config) || [];
      existing.push(result);
      byConfig.set(result.config, existing);
    }

    // Calculate effectiveness per config
    console.log('Bypass Detection Rate by Configuration:\n');
    console.log('Config                  | Bypass Detected | Remediation Created | Avg Scents | Avg Time');
    console.log('------------------------|-----------------|---------------------|------------|----------');

    const configScores: Array<{ name: string; score: number; layers: number }> = [];

    for (const [configName, results] of byConfig.entries()) {
      const bypassScenarios = results.filter(r => r.scenario.includes('BP'));
      const detected = bypassScenarios.filter(r => r.bypassDetected).length;
      const remediated = bypassScenarios.filter(r => r.remediationCreated).length;
      const avgScents = results.reduce((sum, r) => sum + r.scentCount, 0) / results.length;
      const avgTime = results.reduce((sum, r) => sum + r.executionTime, 0) / results.length;

      const detectionRate = bypassScenarios.length > 0 ? detected / bypassScenarios.length : 0;
      const remediationRate = bypassScenarios.length > 0 ? remediated / bypassScenarios.length : 0;

      console.log(
        `${configName.padEnd(23)} | ${detected}/${bypassScenarios.length} (${(detectionRate * 100).toFixed(0)}%)`.padEnd(16) +
        ` | ${remediated}/${bypassScenarios.length} (${(remediationRate * 100).toFixed(0)}%)`.padEnd(20) +
        ` | ${avgScents.toFixed(1).padEnd(10)} | ${avgTime.toFixed(0)}ms`
      );

      // Calculate config score (detection rate × remediation rate)
      const config = CONFIGS.find(c => c.name === configName)!;
      const layerCount = [config.L1, config.L2, config.L3, config.L4, config.L5, config.L6].filter(Boolean).length;
      configScores.push({
        name: configName,
        score: detectionRate * remediationRate,
        layers: layerCount
      });
    }

    // Find minimal viable system
    console.log('\n=== Minimal Viable System ===\n');

    // Sort by score (descending), then by layer count (ascending)
    configScores.sort((a, b) => {
      if (Math.abs(a.score - b.score) < 0.01) {
        return a.layers - b.layers; // Fewer layers better
      }
      return b.score - a.score; // Higher score better
    });

    console.log('Top 5 Configurations (by effectiveness / layers):\n');
    console.log('Rank | Config                  | Score | Layers | Efficiency');
    console.log('-----|------------------------|-------|--------|------------');

    for (let i = 0; i < Math.min(5, configScores.length); i++) {
      const config = configScores[i];
      const efficiency = config.score / config.layers;
      console.log(
        `${(i + 1).toString().padEnd(4)} | ${config.name.padEnd(23)} | ${(config.score * 100).toFixed(0)}%`.padEnd(7) +
        ` | ${config.layers.toString().padEnd(6)} | ${efficiency.toFixed(3)}`
      );
    }

    // Layer utility analysis
    console.log('\n=== Layer Utility Analysis ===\n');

    const utilityByLayer = new Map<LayerName, number[]>();
    for (const result of this.results) {
      for (const [layer, utility] of Object.entries(result.layerUtility)) {
        if (layer === LayerName.BOOTSTRAP) continue;
        const existing = utilityByLayer.get(layer as LayerName) || [];
        existing.push(utility);
        utilityByLayer.set(layer as LayerName, existing);
      }
    }

    console.log('Layer                | Avg Utility | Max | Min | Recommendation');
    console.log('---------------------|-------------|-----|-----|----------------');

    for (const [layer, utilities] of utilityByLayer.entries()) {
      const nonZero = utilities.filter(u => u > 0);
      if (nonZero.length === 0) continue;

      const avg = nonZero.reduce((sum, u) => sum + u, 0) / nonZero.length;
      const max = Math.max(...nonZero);
      const min = Math.min(...nonZero);

      let recommendation = '';
      if (avg < 0.1) recommendation = 'DELETE (low utility)';
      else if (avg < 0.3) recommendation = 'Consider removing';
      else if (avg < 0.7) recommendation = 'Keep';
      else recommendation = 'CRITICAL';

      console.log(
        `${layer.padEnd(20)} | ${(avg * 100).toFixed(1)}%`.padEnd(12) +
        ` | ${(max * 100).toFixed(0)}% | ${(min * 100).toFixed(0)}% | ${recommendation}`
      );
    }

    console.log('');
  }

  /**
   * Get all results.
   */
  getResults(): EvaluationResult[] {
    return [...this.results];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Main
// ============================================================================

async function runEvaluation() {
  const evaluator = new StigmergicEvaluator();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  STIGMERGIC ARCHITECTURE EVALUATION');
  console.log('  Phase 13: Multi-Strategy Analysis');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Phase 13A: Via Negativa
  await evaluator.runViaNegativaEvaluation();
  evaluator.analyzeViaNegativa();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  EVALUATION COMPLETE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

runEvaluation()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Evaluation failed:', err);
    process.exit(1);
  });

export { StigmergicEvaluator };
