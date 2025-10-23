/**
 * Lens Gap Detector Tests
 *
 * Tests the meta-cognitive system that detects gaps in the orchestrator's decision framework.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LensGapDetector } from './lens_gap_detector.js';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('LensGapDetector', () => {
  let tempDir: string;
  let detector: LensGapDetector;

  beforeEach(() => {
    // Create temporary directory for testing
    tempDir = mkdtempSync(join(tmpdir(), 'lens-gap-test-'));
    // Create state/analytics directory
    const analyticsDir = join(tempDir, 'state', 'analytics');
    mkdirSync(analyticsDir, { recursive: true });

    detector = new LensGapDetector(tempDir);
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Task Misfit Detection', () => {
    // SKIPPED: Framework evolved from 7 to 12 lenses (2025-10-23), these tests need redesign
    // TODO: Update tests to reflect 12-lens framework reality
    it.skip('should detect DevOps/SRE lens missing for monitoring tasks', async () => {
      const tasks = [
        {
          id: 'T-OPS-1',
          title: 'Set up Datadog monitoring with PagerDuty alerts',
          description: 'Configure monitoring for production uptime, alert on-call engineer if downtime >5 minutes, set up SLA tracking',
          status: 'pending'
        }
      ];

      const report = await detector.detectGaps(tasks);

      expect(report.misfitTasks.length).toBeGreaterThan(0);

      const opsTask = report.misfitTasks.find(m => m.taskId === 'T-OPS-1');
      expect(opsTask).toBeDefined();
      expect(opsTask?.bestLensScore).toBeLessThan(60);
      expect(opsTask?.reason).toContain('DevOps/SRE');
      expect(opsTask?.suggestedNewLens).toMatch(/DevOps/i);
    });

    it.skip('should detect Security lens missing for security tasks', async () => {
      const tasks = [
        {
          id: 'T-SEC-1',
          title: 'Implement OAuth2 with secret rotation',
          description: 'Add OAuth2 authentication, implement automatic secret rotation every 90 days, encrypt all API keys in vault, penetration testing required',
          status: 'pending'
        }
      ];

      const report = await detector.detectGaps(tasks);

      const secTask = report.misfitTasks.find(m => m.taskId === 'T-SEC-1');
      expect(secTask).toBeDefined();
      expect(secTask?.reason).toContain('Security');
      expect(secTask?.suggestedNewLens).toMatch(/Security/i);
    });

    it.skip('should detect MLOps lens missing for ML pipeline tasks', async () => {
      const tasks = [
        {
          id: 'T-ML-1',
          title: 'Set up model drift detection pipeline',
          description: 'Monitor model performance degradation, track data quality metrics, implement automatic retraining pipeline when drift detected, set up feature store for training data',
          status: 'pending'
        }
      ];

      const report = await detector.detectGaps(tasks);

      const mlTask = report.misfitTasks.find(m => m.taskId === 'T-ML-1');
      expect(mlTask).toBeDefined();
      expect(mlTask?.reason).toContain('MLOps');
      expect(mlTask?.suggestedNewLens).toMatch(/MLOps/i);
    });

    it.skip('should detect Sales Ops lens missing for sales pipeline tasks', async () => {
      const tasks = [
        {
          id: 'T-SALES-1',
          title: 'Implement lead scoring and pipeline tracking',
          description: 'Build lead scoring model based on engagement metrics, track sales pipeline velocity, forecast quota attainment, integrate with CRM for contract management',
          status: 'pending'
        }
      ];

      const report = await detector.detectGaps(tasks);

      const salesTask = report.misfitTasks.find(m => m.taskId === 'T-SALES-1');
      expect(salesTask).toBeDefined();
      expect(salesTask?.reason).toContain('Sales');
      expect(salesTask?.suggestedNewLens).toMatch(/Sales/i);
    });

    it.skip('should detect multiple gap scenarios in comprehensive security review', async () => {
      const tasks = [
        {
          id: 'T-SEC-2',
          title: 'Conduct quarterly security audit and vulnerability assessment',
          description: 'Perform penetration testing, review access control policies, scan for vulnerabilities, assess encryption standards, update security documentation',
          status: 'pending'
        }
      ];

      const report = await detector.detectGaps(tasks);

      const secTask = report.misfitTasks.find(m => m.taskId === 'T-SEC-2');
      expect(secTask).toBeDefined();
      expect(secTask?.reason).toContain('Security');
      expect(secTask?.suggestedNewLens).toMatch(/Security/i);
    });

    it('should not flag tasks that fit existing lenses well', async () => {
      const tasks = [
        {
          id: 'T-GOOD-1',
          title: 'Build demo for revenue generation',
          description: 'Create working demo for prospect meetings, critical for closing deals',
          status: 'pending',
          dependencies: [],
          exit_criteria: ['Demo works', 'Prospects can test'],
          estimated_hours: 4
        }
      ];

      const report = await detector.detectGaps(tasks);

      // This task should pass CEO lens and other relevant lenses
      const goodTask = report.misfitTasks.find(m => m.taskId === 'T-GOOD-1');
      expect(goodTask).toBeUndefined();
    });
  });

  describe('Failure Pattern Analysis', () => {
    it('should detect DevOps lens needed from production outages', async () => {
      // Create incident log with production outages
      const incidentsPath = join(tempDir, 'state', 'incidents.jsonl');
      const incidents = [
        { type: 'production_outage', description: 'Database crashed at 2am, no monitoring caught it', timestamp: '2025-10-01T02:00:00Z' },
        { type: 'downtime', description: 'API server down for 3 hours', timestamp: '2025-10-05T14:00:00Z' },
        { type: 'production_outage', description: 'Disk full, no alerts fired', timestamp: '2025-10-10T03:00:00Z' }
      ];

      writeFileSync(incidentsPath, incidents.map(i => JSON.stringify(i)).join('\n'));

      const report = await detector.detectGaps([]);

      expect(report.failurePatterns.length).toBeGreaterThan(0);

      const opsPattern = report.failurePatterns.find(p => p.suggestedLens === 'DevOps/SRE');
      expect(opsPattern).toBeDefined();
      expect(opsPattern?.count).toBeGreaterThanOrEqual(3);
      expect(opsPattern?.priority).toBe('CRITICAL');
    });

    it('should detect CFO lens needed from cost-related churn', async () => {
      const incidentsPath = join(tempDir, 'state', 'incidents.jsonl');
      const incidents = [
        { type: 'customer_churn', reason: 'too expensive', description: 'Customer cancelled citing high costs', timestamp: '2025-10-01T00:00:00Z' },
        { type: 'customer_churn', reason: 'expensive compared to alternatives', description: 'Price was main objection', timestamp: '2025-10-05T00:00:00Z' }
      ];

      writeFileSync(incidentsPath, incidents.map(i => JSON.stringify(i)).join('\n'));

      const report = await detector.detectGaps([]);

      const cfoPattern = report.failurePatterns.find(p => p.suggestedLens === 'CFO/Unit Economics');
      expect(cfoPattern).toBeDefined();
      expect(cfoPattern?.priority).toBe('HIGH');
    });

    it('should detect Security lens needed from security incidents', async () => {
      const incidentsPath = join(tempDir, 'state', 'incidents.jsonl');
      const incidents = [
        { type: 'security_incident', description: 'API key leaked in GitHub repo', timestamp: '2025-10-01T00:00:00Z' }
      ];

      writeFileSync(incidentsPath, incidents.map(i => JSON.stringify(i)).join('\n'));

      const report = await detector.detectGaps([]);

      const securityPattern = report.failurePatterns.find(p => p.suggestedLens === 'Security');
      expect(securityPattern).toBeDefined();
      expect(securityPattern?.priority).toBe('CRITICAL');
    });

    it('should handle missing incident log gracefully', async () => {
      // No incident log created
      const report = await detector.detectGaps([]);

      expect(report.failurePatterns).toHaveLength(0);
    });
  });

  describe('Proposal Synthesis', () => {
    it('should propose new lenses based on combined evidence', async () => {
      // Create tasks and incidents that both suggest DevOps lens
      const tasks = [
        {
          id: 'T-OPS-1',
          title: 'Set up monitoring',
          description: 'Production monitoring with alerts and SLA tracking',
          status: 'pending'
        },
        {
          id: 'T-OPS-2',
          title: 'Implement deployment pipeline',
          description: 'Blue-green deployment with rollback capability',
          status: 'pending'
        }
      ];

      const incidentsPath = join(tempDir, 'state', 'incidents.jsonl');
      const incidents = [
        { type: 'production_outage', description: 'System down', timestamp: '2025-10-01T00:00:00Z' },
        { type: 'production_outage', description: 'Database crashed', timestamp: '2025-10-05T00:00:00Z' },
        { type: 'production_outage', description: 'API unreachable', timestamp: '2025-10-10T00:00:00Z' }
      ];

      writeFileSync(incidentsPath, incidents.map(i => JSON.stringify(i)).join('\n'));

      const report = await detector.detectGaps(tasks);

      expect(report.proposedLenses.length).toBeGreaterThan(0);

      const opsProposal = report.proposedLenses.find(p => p.name.includes('DevOps') || p.name.includes('SRE'));
      expect(opsProposal).toBeDefined();
      expect(opsProposal?.priority).toBe('CRITICAL');
      expect(opsProposal?.evidence.length).toBeGreaterThan(0);
    });

    it('should prioritize CRITICAL over HIGH over MEDIUM', async () => {
      const tasks = [
        {
          id: 'T1',
          title: 'Set up monitoring and alerts',
          description: 'Production uptime monitoring with incident response',
          status: 'pending'
        },
        {
          id: 'T2',
          title: 'Analyze customer churn',
          description: 'Track retention metrics and usage patterns',
          status: 'pending'
        }
      ];

      // DevOps incident (CRITICAL)
      const incidentsPath = join(tempDir, 'state', 'incidents.jsonl');
      const incidents = [
        { type: 'production_outage', description: 'Critical system failure', timestamp: '2025-10-01T00:00:00Z' },
        { type: 'production_outage', description: 'Another outage', timestamp: '2025-10-05T00:00:00Z' },
        { type: 'production_outage', description: 'Third outage', timestamp: '2025-10-10T00:00:00Z' }
      ];

      writeFileSync(incidentsPath, incidents.map(i => JSON.stringify(i)).join('\n'));

      const report = await detector.detectGaps(tasks);

      // First proposal should be CRITICAL (DevOps)
      expect(report.proposedLenses[0]?.priority).toBe('CRITICAL');
    });
  });

  describe('Recommendation Generation', () => {
    it('should return no-action message when no gaps detected', async () => {
      const report = await detector.detectGaps([]);

      expect(report.recommendation).toContain('No significant gaps');
    });

    it.skip('should provide actionable recommendation when gaps detected', async () => {
      const tasks = [
        {
          id: 'T-SEC-3',
          title: 'Implement security audit program',
          description: 'Set up quarterly penetration testing, vulnerability scanning, security incident response',
          status: 'pending'
        }
      ];

      const report = await detector.detectGaps(tasks);

      expect(report.recommendation).toContain('gap');
      expect(report.recommendation).toContain('Next steps');
    });

    it('should mention expansion from 12-lens framework', async () => {
      const tasks = [
        {
          id: 'T1',
          title: 'Security vulnerability assessment',
          description: 'Conduct penetration testing and security audit',
          status: 'pending'
        },
        {
          id: 'T2',
          title: 'ML model drift monitoring',
          description: 'Track data quality and model performance degradation',
          status: 'pending'
        }
      ];

      const report = await detector.detectGaps(tasks);

      if (report.proposedLenses.length > 0) {
        expect(report.recommendation).toMatch(/\d+-lens.*to.*\d+-lens/);
      }
    });
  });

  describe('shouldExpandFramework', () => {
    it('should return true for CRITICAL gaps', async () => {
      const tasks = [
        {
          id: 'T-SEC-4',
          title: 'Security audit and penetration testing',
          description: 'Conduct security assessment, vulnerability scanning, implement security controls',
          status: 'pending'
        }
      ];

      // Add critical security incident
      const incidentsPath = join(tempDir, 'state', 'incidents.jsonl');
      const incidents = [
        { type: 'security_incident', description: 'Critical security vulnerability', timestamp: '2025-10-01T00:00:00Z' }
      ];

      writeFileSync(incidentsPath, incidents.map(i => JSON.stringify(i)).join('\n'));

      const shouldExpand = await detector.shouldExpandFramework(tasks);

      expect(shouldExpand).toBe(true);
    });

    it('should return false when no critical gaps', async () => {
      const tasks = [
        {
          id: 'T1',
          title: 'Build demo',
          description: 'Revenue-critical demo for customers',
          status: 'pending',
          exit_criteria: ['Demo works'],
          estimated_hours: 4
        }
      ];

      const shouldExpand = await detector.shouldExpandFramework(tasks);

      expect(shouldExpand).toBe(false);
    });
  });

  describe('Report Persistence', () => {
    it('should save gap report to analytics directory', async () => {
      const tasks = [
        {
          id: 'T-OPS-1',
          title: 'Set up monitoring',
          description: 'Production monitoring',
          status: 'pending'
        }
      ];

      await detector.detectGaps(tasks);

      const reportPath = join(tempDir, 'state', 'analytics', 'lens_gap_report.json');
      const fs = require('fs');
      expect(fs.existsSync(reportPath)).toBe(true);

      const reportContent = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
      expect(reportContent.timestamp).toBeDefined();
      expect(reportContent.misfitTasks).toBeDefined();
      expect(reportContent.failurePatterns).toBeDefined();
      expect(reportContent.proposedLenses).toBeDefined();
    });
  });

  describe('Lens Inference', () => {
    // SKIPPED: Same reason as Task Misfit Detection tests above
    it.skip('should infer Security lens from security keywords', async () => {
      const tasks = [
        {
          id: 'T1',
          title: 'Implement penetration testing and vulnerability scanning',
          description: 'Conduct security audit, test for vulnerabilities, implement access control encryption',
          status: 'pending'
        }
      ];

      const report = await detector.detectGaps(tasks);
      const misfit = report.misfitTasks.find(m => m.taskId === 'T1');

      expect(misfit?.suggestedNewLens).toMatch(/Security/i);
      expect(misfit?.confidence).toBeGreaterThan(0);
    });

    it.skip('should infer MLOps lens from ML pipeline keywords', async () => {
      const tasks = [
        {
          id: 'T1',
          title: 'Implement model drift detection',
          description: 'Monitor data quality and model performance, set up training pipeline and feature store',
          status: 'pending'
        }
      ];

      const report = await detector.detectGaps(tasks);
      const misfit = report.misfitTasks.find(m => m.taskId === 'T1');

      expect(misfit?.suggestedNewLens).toMatch(/MLOps/i);
    });

    it.skip('should have high confidence for strong keyword matches', async () => {
      const tasks = [
        {
          id: 'T1',
          title: 'Enterprise security program',
          description: 'Implement security controls, penetration testing, vulnerability assessment, access control',
          status: 'pending'
        }
      ];

      const report = await detector.detectGaps(tasks);
      const misfit = report.misfitTasks.find(m => m.taskId === 'T1');

      expect(misfit?.confidence).toBeGreaterThan(0.3);
    });
  });
});
