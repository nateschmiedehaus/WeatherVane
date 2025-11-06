#!/usr/bin/env node
import { initStorage, storageExists } from './fileStorage';
import { addTask, listTasks, markTaskDone, removeTask, getStats } from './taskManager';
import { formatTaskList, formatStats } from './formatter';
import chalk from 'chalk';

const args = process.argv.slice(2);
const command = args[0];

try {
  switch (command) {
    case 'init':
      initStorage();
      console.log(chalk.green('✓ Initialized TaskFlow in ' + process.cwd()));
      break;

    case 'add':
      const description = args.slice(1).join(' ');
      if (!description) {
        console.error(chalk.red('Error: Please provide a task description'));
        process.exit(1);
      }
      const task = addTask(description);
      console.log(chalk.green(`✓ Added task #${task.id}: ${task.description}`));
      break;

    case 'list':
      const statusArg = args.indexOf('--status');
      const statusFilter = statusArg !== -1 ? args[statusArg + 1] as 'pending' | 'done' : undefined;
      const tasks = listTasks(statusFilter);
      console.log(formatTaskList(tasks));
      break;

    case 'done':
      const doneId = parseInt(args[1]);
      if (isNaN(doneId)) {
        console.error(chalk.red('Error: Please provide a valid task ID'));
        process.exit(1);
      }
      markTaskDone(doneId);
      console.log(chalk.green(`✓ Marked task #${doneId} as done`));
      break;

    case 'remove':
      const removeId = parseInt(args[1]);
      if (isNaN(removeId)) {
        console.error(chalk.red('Error: Please provide a valid task ID'));
        process.exit(1);
      }
      removeTask(removeId);
      console.log(chalk.green(`✓ Removed task #${removeId}`));
      break;

    case 'stats':
      const store = getStats();
      console.log(formatStats(store));
      break;

    case 'help':
    case '--help':
    case undefined:
      console.log(`
TaskFlow - Minimal CLI Task Tracker

Usage:
  taskflow init                    Initialize task list
  taskflow add "description"       Add a new task
  taskflow list                    List all tasks
  taskflow list --status pending   List pending tasks
  taskflow list --status done      List completed tasks
  taskflow done [id]               Mark task as done
  taskflow remove [id]             Remove a task
  taskflow stats                   Show statistics
  taskflow help                    Show this help

Examples:
  taskflow add "Buy groceries"
  taskflow done 1
  taskflow list --status pending
      `.trim());
      break;

    default:
      console.error(chalk.red(`Error: Unknown command "${command}"`));
      console.log('Run "taskflow help" for usage information');
      process.exit(1);
  }
} catch (error) {
  console.error(chalk.red('Error: ' + (error as Error).message));
  process.exit(1);
}
