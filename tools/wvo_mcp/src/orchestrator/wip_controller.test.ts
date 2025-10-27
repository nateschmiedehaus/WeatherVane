/**
 * WIP Controller Tests
 *
 * Validates slot-based WIP management and queue behavior.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { WIPController } from './wip_controller.js';

describe('WIPController', () => {
  let controller: WIPController;

  beforeEach(() => {
    controller = new WIPController({
      perWorkerLimit: 2,
      globalLimit: 6,
      queueLimit: 10,
    });
  });

  describe('slot reservation', () => {
    it('reserves slot for task', () => {
      const reserved = controller.reserveSlot('T1', 'worker1');

      expect(reserved).toBe(true);

      const status = controller.getStatus();
      expect(status.current).toBe(1);
      expect(status.available).toBe(5);
      expect(status.perWorker['worker1']).toBe(1);
    });

    it('prevents double reservation of same task', () => {
      controller.reserveSlot('T1', 'worker1');
      const secondReservation = controller.reserveSlot('T1', 'worker2');

      expect(secondReservation).toBe(false);

      const status = controller.getStatus();
      expect(status.current).toBe(1); // Still just one
    });

    it('releases slot when task completes', () => {
      controller.reserveSlot('T1', 'worker1');
      controller.releaseSlot('T1');

      const status = controller.getStatus();
      expect(status.current).toBe(0);
      expect(status.available).toBe(6);
    });

    it('handles release of non-existent slot gracefully', () => {
      controller.releaseSlot('nonexistent');

      const status = controller.getStatus();
      expect(status.current).toBe(0);
    });
  });

  describe('global limit enforcement', () => {
    it('blocks reservation when global limit reached', () => {
      // Fill to capacity (6)
      controller.reserveSlot('T1', 'worker1');
      controller.reserveSlot('T2', 'worker1');
      controller.reserveSlot('T3', 'worker2');
      controller.reserveSlot('T4', 'worker2');
      controller.reserveSlot('T5', 'worker3');
      controller.reserveSlot('T6', 'worker3');

      const status = controller.getStatus();
      expect(status.current).toBe(6);
      expect(status.atLimit).toBe(true);

      // Try to reserve one more
      const reserved = controller.reserveSlot('T7', 'worker4');
      expect(reserved).toBe(false);
    });

    it('allows reservation after slot released', () => {
      // Fill to capacity
      controller.reserveSlot('T1', 'worker1');
      controller.reserveSlot('T2', 'worker1');
      controller.reserveSlot('T3', 'worker2');
      controller.reserveSlot('T4', 'worker2');
      controller.reserveSlot('T5', 'worker3');
      controller.reserveSlot('T6', 'worker3');

      // Release one
      controller.releaseSlot('T1');

      // Should be able to reserve now
      const reserved = controller.reserveSlot('T7', 'worker1');
      expect(reserved).toBe(true);
    });

    it('reports correct availability', () => {
      controller.reserveSlot('T1', 'worker1');
      controller.reserveSlot('T2', 'worker1');
      controller.reserveSlot('T3', 'worker2');

      const status = controller.getStatus();
      expect(status.current).toBe(3);
      expect(status.available).toBe(3);
      expect(status.limit).toBe(6);
    });

    it('canAcceptTask returns false when at limit', () => {
      // Fill to capacity
      for (let i = 1; i <= 6; i++) {
        controller.reserveSlot(`T${i}`, `worker${Math.ceil(i / 2)}`);
      }

      expect(controller.canAcceptTask()).toBe(false);
    });

    it('canAcceptTask returns true when capacity available', () => {
      controller.reserveSlot('T1', 'worker1');

      expect(controller.canAcceptTask()).toBe(true);
    });
  });

  describe('per-worker limit enforcement', () => {
    it('blocks reservation when worker at limit', () => {
      controller.reserveSlot('T1', 'worker1');
      controller.reserveSlot('T2', 'worker1');

      const status = controller.getStatus();
      expect(status.perWorker['worker1']).toBe(2);

      // Try to assign third task to same worker
      const reserved = controller.reserveSlot('T3', 'worker1');
      expect(reserved).toBe(false);
    });

    it('allows different workers to reserve up to their limits', () => {
      controller.reserveSlot('T1', 'worker1');
      controller.reserveSlot('T2', 'worker1');
      controller.reserveSlot('T3', 'worker2');
      controller.reserveSlot('T4', 'worker2');

      const status = controller.getStatus();
      expect(status.current).toBe(4);
      expect(status.perWorker['worker1']).toBe(2);
      expect(status.perWorker['worker2']).toBe(2);
    });

    it('tracks worker task counts correctly', () => {
      controller.reserveSlot('T1', 'worker1');
      controller.reserveSlot('T2', 'worker2');
      controller.reserveSlot('T3', 'worker1');

      expect(controller.getWorkerTaskCount('worker1')).toBe(2);
      expect(controller.getWorkerTaskCount('worker2')).toBe(1);
      expect(controller.getWorkerTaskCount('worker3')).toBe(0);
    });

    it('canWorkerAcceptTask returns correct values', () => {
      controller.reserveSlot('T1', 'worker1');
      controller.reserveSlot('T2', 'worker1');

      expect(controller.canWorkerAcceptTask('worker1')).toBe(false);
      expect(controller.canWorkerAcceptTask('worker2')).toBe(true);
    });
  });

  describe('queue management', () => {
    it('enqueues task when provided', () => {
      const enqueued = controller.enqueueTask('T1');

      expect(enqueued).toBe(true);

      const status = controller.getStatus();
      expect(status.queued).toBe(1);
    });

    it('dequeues task in FIFO order', () => {
      controller.enqueueTask('T1');
      controller.enqueueTask('T2');
      controller.enqueueTask('T3');

      expect(controller.dequeueTask()).toBe('T1');
      expect(controller.dequeueTask()).toBe('T2');
      expect(controller.dequeueTask()).toBe('T3');
      expect(controller.dequeueTask()).toBeUndefined();
    });

    it('blocks enqueue when queue limit reached', () => {
      // Fill queue to limit (10)
      for (let i = 1; i <= 10; i++) {
        controller.enqueueTask(`T${i}`);
      }

      const enqueued = controller.enqueueTask('T11');
      expect(enqueued).toBe(false);

      const status = controller.getStatus();
      expect(status.queued).toBe(10);
    });

    it('getQueuedTasks returns queued task IDs', () => {
      controller.enqueueTask('T1');
      controller.enqueueTask('T2');

      const queued = controller.getQueuedTasks();
      expect(queued).toEqual(['T1', 'T2']);
    });

    it('queue operations do not affect WIP slots', () => {
      controller.reserveSlot('T1', 'worker1');
      controller.enqueueTask('T2');
      controller.enqueueTask('T3');

      const status = controller.getStatus();
      expect(status.current).toBe(1); // Only reserved tasks
      expect(status.queued).toBe(2);
    });
  });

  describe('combined slot and queue workflow', () => {
    it('handles typical workflow: reserve, queue, release, dequeue', () => {
      // Fill to capacity
      for (let i = 1; i <= 6; i++) {
        controller.reserveSlot(`T${i}`, `worker${Math.ceil(i / 2)}`);
      }

      // Queue more tasks
      controller.enqueueTask('T7');
      controller.enqueueTask('T8');

      const status1 = controller.getStatus();
      expect(status1.current).toBe(6);
      expect(status1.queued).toBe(2);
      expect(status1.available).toBe(0);

      // Complete a task
      controller.releaseSlot('T1');

      const status2 = controller.getStatus();
      expect(status2.current).toBe(5);
      expect(status2.available).toBe(1);

      // Dequeue and reserve
      const nextTask = controller.dequeueTask();
      expect(nextTask).toBe('T7');

      controller.reserveSlot(nextTask!, 'worker1');

      const status3 = controller.getStatus();
      expect(status3.current).toBe(6);
      expect(status3.queued).toBe(1);
    });
  });

  describe('concurrent operations', () => {
    it('handles multiple workers reserving simultaneously', () => {
      const results = [];

      // Simulate concurrent reservations
      results.push(controller.reserveSlot('T1', 'worker1'));
      results.push(controller.reserveSlot('T2', 'worker2'));
      results.push(controller.reserveSlot('T3', 'worker3'));
      results.push(controller.reserveSlot('T4', 'worker1'));
      results.push(controller.reserveSlot('T5', 'worker2'));
      results.push(controller.reserveSlot('T6', 'worker3'));

      // All should succeed (within limits)
      expect(results.every((r) => r === true)).toBe(true);

      const status = controller.getStatus();
      expect(status.current).toBe(6);
      expect(status.perWorker['worker1']).toBe(2);
      expect(status.perWorker['worker2']).toBe(2);
      expect(status.perWorker['worker3']).toBe(2);
    });

    it('prevents race condition with same task ID', () => {
      controller.reserveSlot('T1', 'worker1');

      // Second worker tries to reserve same task
      const result = controller.reserveSlot('T1', 'worker2');

      expect(result).toBe(false);

      const status = controller.getStatus();
      expect(status.current).toBe(1);
      expect(status.perWorker['worker1']).toBe(1);
      expect(status.perWorker['worker2']).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('handles empty state correctly', () => {
      const status = controller.getStatus();

      expect(status.current).toBe(0);
      expect(status.available).toBe(6);
      expect(status.queued).toBe(0);
      expect(status.atLimit).toBe(false);
    });

    it('handles release before reserve gracefully', () => {
      controller.releaseSlot('T1');

      const status = controller.getStatus();
      expect(status.current).toBe(0);
    });

    it('handles dequeue on empty queue', () => {
      const task = controller.dequeueTask();

      expect(task).toBeUndefined();
    });

    it('reset clears all state', () => {
      controller.reserveSlot('T1', 'worker1');
      controller.reserveSlot('T2', 'worker2');
      controller.enqueueTask('T3');
      controller.enqueueTask('T4');

      controller.reset();

      const status = controller.getStatus();
      expect(status.current).toBe(0);
      expect(status.queued).toBe(0);
      expect(controller.canAcceptTask()).toBe(true);
    });
  });

  describe('configuration', () => {
    it('uses custom configuration', () => {
      const customController = new WIPController({
        perWorkerLimit: 3,
        globalLimit: 9,
        queueLimit: 20,
      });

      // Can reserve 3 per worker
      customController.reserveSlot('T1', 'worker1');
      customController.reserveSlot('T2', 'worker1');
      customController.reserveSlot('T3', 'worker1');

      expect(customController.canWorkerAcceptTask('worker1')).toBe(false);

      const status = customController.getStatus();
      expect(status.limit).toBe(9);
    });

    it('updates configuration dynamically', () => {
      controller.updateConfig({
        globalLimit: 10,
        perWorkerLimit: 3,
      });

      // Can now reserve more
      for (let i = 1; i <= 9; i++) {
        controller.reserveSlot(`T${i}`, `worker${Math.ceil(i / 3)}`);
      }

      const status = controller.getStatus();
      expect(status.current).toBe(9);
      expect(status.limit).toBe(10);
      expect(status.perWorker['worker1']).toBe(3);
    });

    it('uses default configuration when not specified', () => {
      const defaultController = new WIPController();

      const status = defaultController.getStatus();
      expect(status.limit).toBe(12); // Default global limit
    });
  });

  describe('status reporting', () => {
    it('reports detailed status', () => {
      controller.reserveSlot('T1', 'worker1');
      controller.reserveSlot('T2', 'worker1');
      controller.reserveSlot('T3', 'worker2');
      controller.enqueueTask('T4');

      const status = controller.getStatus();

      expect(status).toEqual({
        current: 3,
        limit: 6,
        available: 3,
        queued: 1,
        perWorker: {
          worker1: 2,
          worker2: 1,
        },
        atLimit: false,
      });
    });

    it('reports atLimit correctly', () => {
      for (let i = 1; i <= 6; i++) {
        controller.reserveSlot(`T${i}`, `worker${Math.ceil(i / 2)}`);
      }

      const status = controller.getStatus();
      expect(status.atLimit).toBe(true);
    });
  });
});
