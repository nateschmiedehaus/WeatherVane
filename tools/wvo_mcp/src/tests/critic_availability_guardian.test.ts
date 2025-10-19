import { describe, it, expect } from 'vitest';
import { guardAgainstCriticBlocking } from '../orchestrator/critic_availability_guardian.js';
import type { RoadmapDocument } from '../utils/types.js';

describe('CriticAvailabilityGuardian', () => {
  it('unblocks tasks that are blocked solely due to unavailable critics', () => {
    const mockRoadmap: RoadmapDocument = {
      epics: [
        {
          id: 'E1',
          title: 'Test Epic',
          description: 'Test',
          milestones: [
            {
              id: 'M1.1',
              title: 'Test Milestone',
              description: 'Test',
              tasks: [
                {
                  id: 'T1.1.1',
                  title: 'Test task blocked by design_system critic',
                  owner: 'WVO',
                  status: 'blocked' as const,
                  exit_criteria: ['artifact: test.tsx', 'critic: design_system'],
                },
                {
                  id: 'T1.1.2',
                  title: 'Test task blocked by other reason',
                  owner: 'WVO',
                  status: 'blocked' as const,
                  exit_criteria: ['artifact: other.tsx'],
                },
                {
                  id: 'T1.1.3',
                  title: 'Test task pending',
                  owner: 'WVO',
                  status: 'pending' as const,
                  exit_criteria: ['artifact: pending.tsx', 'critic: design_system'],
                },
              ],
            },
          ],
        },
      ],
    };

    const report = guardAgainstCriticBlocking(mockRoadmap);

    // Should unblock T1.1.1 (blocked by unavailable critic)
    expect(report.overridesApplied).toBe(1);
    expect(report.tasksUnblocked).toContain('T1.1.1');

    // T1.1.1 should now be pending
    const task111 = mockRoadmap.epics[0].milestones[0].tasks[0];
    expect(task111.status).toBe('pending');
    expect(task111.notes).toContain('Auto-unblocked');

    // T1.1.2 should remain blocked (not blocked by critic)
    const task112 = mockRoadmap.epics[0].milestones[0].tasks[1];
    expect(task112.status).toBe('blocked');

    // T1.1.3 should remain pending (already pending)
    const task113 = mockRoadmap.epics[0].milestones[0].tasks[2];
    expect(task113.status).toBe('pending');

    // Should track critic requirements
    const deferredRequirements = report.criticRequirements.filter(r => r.status === 'deferred');
    expect(deferredRequirements.length).toBeGreaterThan(0);
    expect(deferredRequirements.some(r => r.taskId === 'T1.1.1' && r.criticName === 'design_system')).toBe(true);
  });

  it('handles tasks with multiple critics', () => {
    const mockRoadmap: RoadmapDocument = {
      epics: [
        {
          id: 'E1',
          title: 'Test Epic',
          description: 'Test',
          milestones: [
            {
              id: 'M1.1',
              title: 'Test Milestone',
              description: 'Test',
              tasks: [
                {
                  id: 'T1.1.1',
                  title: 'Task blocked by multiple unavailable critics',
                  owner: 'WVO',
                  status: 'blocked' as const,
                  exit_criteria: [
                    'critic: design_system',
                    'critic: manager_self_check',
                    'artifact: test.tsx',
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const report = guardAgainstCriticBlocking(mockRoadmap);

    expect(report.overridesApplied).toBe(1);
    expect(report.tasksUnblocked).toContain('T1.1.1');

    // Should track both critics as deferred
    const deferredRequirements = report.criticRequirements.filter(r => r.status === 'deferred');
    expect(deferredRequirements.some(r => r.taskId === 'T1.1.1' && r.criticName === 'design_system')).toBe(true);
    expect(deferredRequirements.some(r => r.taskId === 'T1.1.1' && r.criticName === 'manager_self_check')).toBe(true);
  });

  it('does not unblock tasks without critic exit criteria', () => {
    const mockRoadmap: RoadmapDocument = {
      epics: [
        {
          id: 'E1',
          title: 'Test Epic',
          description: 'Test',
          milestones: [
            {
              id: 'M1.1',
              title: 'Test Milestone',
              description: 'Test',
              tasks: [
                {
                  id: 'T1.1.1',
                  title: 'Task blocked for other reasons',
                  owner: 'WVO',
                  status: 'blocked' as const,
                  exit_criteria: ['artifact: test.tsx', 'tests: test.spec.ts'],
                },
              ],
            },
          ],
        },
      ],
    };

    const report = guardAgainstCriticBlocking(mockRoadmap);

    // Should not unblock - no critic requirements
    expect(report.overridesApplied).toBe(0);
    expect(report.tasksUnblocked).toHaveLength(0);

    // Task should remain blocked
    const task = mockRoadmap.epics[0].milestones[0].tasks[0];
    expect(task.status).toBe('blocked');
  });

  it('logs warnings for each unblocked task', () => {
    const mockRoadmap: RoadmapDocument = {
      epics: [
        {
          id: 'E1',
          title: 'Test Epic',
          description: 'Test',
          milestones: [
            {
              id: 'M1.1',
              title: 'Test Milestone',
              description: 'Test',
              tasks: [
                {
                  id: 'T1.1.1',
                  title: 'Task 1',
                  owner: 'WVO',
                  status: 'blocked' as const,
                  exit_criteria: ['critic: design_system'],
                },
                {
                  id: 'T1.1.2',
                  title: 'Task 2',
                  owner: 'WVO',
                  status: 'blocked' as const,
                  exit_criteria: ['critic: design_system'],
                },
              ],
            },
          ],
        },
      ],
    };

    const report = guardAgainstCriticBlocking(mockRoadmap);

    expect(report.warnings).toHaveLength(2);
    expect(report.warnings[0]).toContain('T1.1.1');
    expect(report.warnings[0]).toContain('design_system');
    expect(report.warnings[1]).toContain('T1.1.2');
  });
});
