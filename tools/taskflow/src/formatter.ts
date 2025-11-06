import chalk from 'chalk';
import { Task, TaskStore } from './types';

export function formatTask(task: Task): string {
  const checkbox = task.status === 'done' ? chalk.green('[✓]') : chalk.yellow('[ ]');
  const description = task.status === 'done'
    ? chalk.green(task.description)
    : chalk.yellow(task.description);
  return `#${task.id} ${checkbox} ${description} (created: ${task.createdAt})`;
}

export function formatTaskList(tasks: Task[]): string {
  if (tasks.length === 0) {
    return "No tasks found. Use 'taskflow add' to create one.";
  }
  return tasks.map(formatTask).join('\n');
}

export function formatStats(store: TaskStore): string {
  const total = store.tasks.length;
  const pending = store.tasks.filter(t => t.status === 'pending').length;
  const done = store.tasks.filter(t => t.status === 'done').length;
  const rate = total > 0 ? Math.round((done / total) * 100) : 0;

  return `
Total tasks: ${total}
Pending: ${chalk.yellow(pending.toString())}
Done: ${chalk.green(done.toString())}
Completion rate: ${rate}%
  `.trim();
}
