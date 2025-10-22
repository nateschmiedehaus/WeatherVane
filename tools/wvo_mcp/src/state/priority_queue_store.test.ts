import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { PriorityQueueStore } from "./priority_queue_store.js";
import type { HeavyTaskQueueItem } from "../utils/types.js";

describe("PriorityQueueStore", () => {
  let tempDir: string;
  let store: PriorityQueueStore;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `priority_queue_test_${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    store = new PriorityQueueStore(tempDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe("enqueue and list", () => {
    it("should enqueue a task with default priority", async () => {
      const task = await store.enqueue({
        summary: "Test task",
        command: "echo hello",
      });

      expect(task.summary).toBe("Test task");
      expect(task.priority).toBe("normal");
      expect(task.status).toBe("queued");
      expect(task.id).toBeDefined();
      expect(task.created_at).toBeDefined();
      expect(task.updated_at).toBeDefined();
    });

    it("should enqueue a task with explicit priority", async () => {
      const task = await store.enqueue({
        summary: "Urgent task",
        priority: "urgent",
      });

      expect(task.priority).toBe("urgent");
    });

    it("should list tasks in priority order (urgent > normal > background)", async () => {
      // Enqueue in mixed order
      await store.enqueue({ summary: "Background 1", priority: "background" });
      await store.enqueue({ summary: "Urgent 1", priority: "urgent" });
      await store.enqueue({ summary: "Normal 1", priority: "normal" });
      await store.enqueue({ summary: "Background 2", priority: "background" });
      await store.enqueue({ summary: "Urgent 2", priority: "urgent" });

      const list = await store.list();

      expect(list[0].priority).toBe("urgent");
      expect(list[1].priority).toBe("urgent");
      expect(list[2].priority).toBe("normal");
      expect(list[3].priority).toBe("background");
      expect(list[4].priority).toBe("background");
    });

    it("should maintain creation time order within same priority", async () => {
      const task1 = await store.enqueue({
        summary: "First normal",
        priority: "normal",
      });

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      const task2 = await store.enqueue({
        summary: "Second normal",
        priority: "normal",
      });

      const list = await store.list();
      const normalTasks = list.filter((t) => t.priority === "normal");

      expect(normalTasks[0].id).toBe(task1.id);
      expect(normalTasks[1].id).toBe(task2.id);
    });
  });

  describe("task lifecycle", () => {
    it("should start a queued task", async () => {
      const task = await store.enqueue({
        summary: "Test task",
        priority: "normal",
      });

      const started = await store.startTask(task.id);

      expect(started?.status).toBe("running");
      expect(started?.execution_start_time).toBeDefined();
    });

    it("should complete a running task with metrics", async () => {
      const task = await store.enqueue({
        summary: "Test task",
        priority: "urgent",
      });

      await store.startTask(task.id);

      const completed = await store.completeTask(task.id, 1234, "Success");

      expect(completed?.status).toBe("completed");
      expect(completed?.execution_duration_ms).toBe(1234);
      expect(completed?.notes).toBe("Success");
    });

    it("should cancel a queued task", async () => {
      const task = await store.enqueue({
        summary: "Test task",
        priority: "background",
      });

      const cancelled = await store.cancelTask(task.id, "User requested");

      expect(cancelled?.status).toBe("cancelled");
      expect(cancelled?.notes).toContain("Cancelled: User requested");
    });

    it("should cancel a running task and release semaphore", async () => {
      const task = await store.enqueue({
        summary: "Test task",
        priority: "normal",
      });

      await store.startTask(task.id);

      const cancelled = await store.cancelTask(task.id, "Timeout");

      expect(cancelled?.status).toBe("cancelled");
    });
  });

  describe("getNextBatch", () => {
    it("should return queued tasks in priority order", async () => {
      await store.enqueue({ summary: "Background", priority: "background" });
      await store.enqueue({ summary: "Urgent", priority: "urgent" });
      await store.enqueue({ summary: "Normal", priority: "normal" });

      const batch = await store.getNextBatch(10);

      expect(batch.length).toBe(3);
      expect(batch[0].priority).toBe("urgent");
      expect(batch[1].priority).toBe("normal");
      expect(batch[2].priority).toBe("background");
    });

    it("should respect maxTasks limit", async () => {
      for (let i = 0; i < 10; i++) {
        await store.enqueue({
          summary: `Task ${i}`,
          priority: "normal",
        });
      }

      const batch = await store.getNextBatch(5);

      expect(batch.length).toBe(5);
    });

    it("should not return running or completed tasks", async () => {
      const task1 = await store.enqueue({ summary: "Task 1" });
      const task2 = await store.enqueue({ summary: "Task 2" });
      const task3 = await store.enqueue({ summary: "Task 3" });

      await store.startTask(task1.id);
      await store.completeTask(task1.id, 100);

      const batch = await store.getNextBatch(10);

      expect(batch.length).toBe(2);
      expect(batch.every((t) => t.status === "queued")).toBe(true);
    });
  });

  describe("concurrency limits", () => {
    it("should initialize with default concurrency limits", async () => {
      const metrics = await store.getMetrics();
      // Just verify it can be called without error
      expect(metrics).toBeDefined();
    });

    it("should support custom concurrency limits", async () => {
      const customStore = new PriorityQueueStore(tempDir, {
        urgent: 2,
        normal: 1,
        background: 0,
      });

      const metrics = await customStore.getMetrics();

      expect(metrics.concurrency_usage.urgent.limit).toBe(2);
      expect(metrics.concurrency_usage.normal.limit).toBe(1);
      expect(metrics.concurrency_usage.background.limit).toBe(0);
    });
  });

  describe("worker concurrency cap enforcement", () => {
    it("should enforce max workers limit", async () => {
      // Create 5 running tasks
      for (let i = 0; i < 5; i++) {
        const task = await store.enqueue({ summary: `Task ${i}` });
        await store.startTask(task.id);
      }

      // Enforce cap of 3 workers
      const { enforced, released } = await store.enforceWorkerCap(3);

      expect(enforced).toBe(true);
      expect(released).toBe(2);

      // Verify only 3 tasks are still running
      const list = await store.list();
      const running = list.filter((t) => t.status === "running");
      expect(running.length).toBe(3);
    });

    it("should cancel background tasks first when enforcing cap", async () => {
      // Create tasks in different priority levels
      const bgTask = await store.enqueue({
        summary: "Background",
        priority: "background",
      });
      const normalTask = await store.enqueue({
        summary: "Normal",
        priority: "normal",
      });
      const urgentTask = await store.enqueue({
        summary: "Urgent",
        priority: "urgent",
      });

      // Start all of them
      await store.startTask(bgTask.id);
      await store.startTask(normalTask.id);
      await store.startTask(urgentTask.id);

      // Enforce cap of 1 worker
      await store.enforceWorkerCap(1);

      // Verify background was cancelled first
      const list = await store.list();
      const bgStatus = list.find((t) => t.id === bgTask.id)?.status;
      const running = list.filter((t) => t.status === "running");

      expect(bgStatus).toBe("cancelled");
      expect(running.length).toBe(1);
    });

    it("should not cancel if under worker cap", async () => {
      const task1 = await store.enqueue({ summary: "Task 1" });
      const task2 = await store.enqueue({ summary: "Task 2" });

      await store.startTask(task1.id);
      await store.startTask(task2.id);

      const { released } = await store.enforceWorkerCap(5);

      expect(released).toBe(0);

      const list = await store.list();
      const running = list.filter((t) => t.status === "running");
      expect(running.length).toBe(2);
    });
  });

  describe("getMetrics", () => {
    it("should provide queue metrics by priority lane", async () => {
      await store.enqueue({ summary: "Urgent 1", priority: "urgent" });
      await store.enqueue({ summary: "Urgent 2", priority: "urgent" });
      await store.enqueue({ summary: "Normal 1", priority: "normal" });

      const metrics = await store.getMetrics();

      expect(metrics.total_tasks).toBe(3);
      expect(metrics.by_priority.urgent.queued_count).toBe(2);
      expect(metrics.by_priority.normal.queued_count).toBe(1);
      expect(metrics.by_priority.background.queued_count).toBe(0);
    });

    it("should track running tasks per lane", async () => {
      const task1 = await store.enqueue({
        summary: "Urgent",
        priority: "urgent",
      });
      const task2 = await store.enqueue({
        summary: "Normal",
        priority: "normal",
      });

      await store.startTask(task1.id);
      await store.startTask(task2.id);

      const metrics = await store.getMetrics();

      expect(metrics.by_priority.urgent.running_count).toBe(1);
      expect(metrics.by_priority.normal.running_count).toBe(1);
    });

    it("should calculate average wait time for completed tasks", async () => {
      const task = await store.enqueue({
        summary: "Test",
        priority: "normal",
      });

      await store.startTask(task.id);

      // Wait a bit to have measurable duration
      await new Promise((resolve) => setTimeout(resolve, 50));

      await store.completeTask(task.id, 50);

      const metrics = await store.getMetrics();

      expect(metrics.by_priority.normal.avg_wait_time_ms).toBeGreaterThan(0);
      expect(metrics.by_priority.normal.total_processed).toBe(1);
    });
  });

  describe("updateStatus", () => {
    it("should update task status and notes", async () => {
      const task = await store.enqueue({
        summary: "Test",
        notes: "Original",
      });

      const updated = await store.updateStatus({
        id: task.id,
        status: "running",
        notes: "Updated",
      });

      expect(updated?.status).toBe("running");
      expect(updated?.notes).toBe("Updated");
    });

    it("should return null for non-existent task", async () => {
      const updated = await store.updateStatus({
        id: "non-existent",
        status: "completed",
      });

      expect(updated).toBeNull();
    });

    it("should record execution metrics when updating", async () => {
      const task = await store.enqueue({
        summary: "Test",
      });

      const updated = await store.updateStatus({
        id: task.id,
        status: "completed",
        execution_start_time: "2024-01-01T00:00:00Z",
        execution_duration_ms: 5000,
      });

      expect(updated?.execution_start_time).toBe("2024-01-01T00:00:00Z");
      expect(updated?.execution_duration_ms).toBe(5000);
    });
  });

  describe("persistence", () => {
    it("should persist tasks to file", async () => {
      const task = await store.enqueue({
        summary: "Persistent task",
        priority: "urgent",
      });

      // Create new store instance reading same file
      const store2 = new PriorityQueueStore(tempDir);
      const list = await store2.list();

      expect(list.length).toBe(1);
      expect(list[0].id).toBe(task.id);
      expect(list[0].summary).toBe("Persistent task");
    });

    it("should handle empty queue gracefully", async () => {
      const list = await store.list();
      expect(list).toEqual([]);

      const metrics = await store.getMetrics();
      expect(metrics.total_tasks).toBe(0);
    });
  });
});
