type Lane = 'interactive' | 'background' | 'batch';

const LANE_PRIORITY: Lane[] = ['interactive', 'background', 'batch'];

export interface LaneQueueSnapshot {
  active: Record<Lane, number>;
  pending: Record<Lane, number>;
  concurrency: Record<Lane, number>;
}

type ScheduledTask<T> = {
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

export class LaneQueue {
  private readonly queues: Record<Lane, Array<ScheduledTask<unknown>>> = {
    interactive: [],
    background: [],
    batch: [],
  };

  private readonly active: Record<Lane, number> = {
    interactive: 0,
    background: 0,
    batch: 0,
  };

  private readonly concurrency: Record<Lane, number>;

  constructor(config?: Partial<Record<Lane, number>>) {
    this.concurrency = {
      interactive: this.normalizeLimit(config?.interactive ?? 3),
      background: this.normalizeLimit(config?.background ?? 2),
      batch: this.normalizeLimit(config?.batch ?? 1),
    };
  }

  schedule<T>(lane: Lane, task: () => Promise<T> | T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const scheduled: ScheduledTask<T> = {
        run: async () => Promise.resolve().then(task),
        resolve,
        reject,
      };
      this.queues[lane].push(scheduled as ScheduledTask<unknown>);
      this.drain();
    });
  }

  setConcurrency(lane: Lane, limit: number): void {
    const normalized = this.normalizeLimit(limit);
    if (this.concurrency[lane] !== normalized) {
      this.concurrency[lane] = normalized;
      this.drain();
    }
  }

  getSnapshot(): LaneQueueSnapshot {
    return {
      active: { ...this.active },
      pending: {
        interactive: this.queues.interactive.length,
        background: this.queues.background.length,
        batch: this.queues.batch.length,
      },
      concurrency: { ...this.concurrency },
    };
  }

  private drain(): void {
    for (const lane of LANE_PRIORITY) {
      while (this.active[lane] < this.concurrency[lane] && this.queues[lane].length > 0) {
        const next = this.queues[lane].shift();
        if (!next) {
          break;
        }
        this.execute(lane, next);
      }
    }
  }

  private execute<T>(lane: Lane, task: ScheduledTask<T>): void {
    this.active[lane] += 1;
    task
      .run()
      .then((result) => {
        task.resolve(result);
      })
      .catch((error) => {
        task.reject(error);
      })
      .finally(() => {
        this.active[lane] = Math.max(0, this.active[lane] - 1);
        this.drain();
      });
  }

  private normalizeLimit(limit: number): number {
    if (!Number.isFinite(limit) || limit <= 0) {
      return 1;
    }
    return Math.max(1, Math.floor(limit));
  }
}

export type { Lane };
