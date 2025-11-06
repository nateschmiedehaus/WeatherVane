import { loadTasks, saveTasks } from './fileStorage';
import { Task, TaskStore } from './types';

export function addTask(description: string): Task {
  const store = loadTasks();
  const newTask: Task = {
    id: store.nextId,
    description,
    status: 'pending',
    createdAt: new Date().toISOString().split('T')[0]
  };
  store.tasks.push(newTask);
  store.nextId++;
  saveTasks(store);
  return newTask;
}

export function listTasks(statusFilter?: 'pending' | 'done'): Task[] {
  const store = loadTasks();
  if (statusFilter) {
    return store.tasks.filter(t => t.status === statusFilter);
  }
  return store.tasks;
}

export function markTaskDone(id: number): void {
  const store = loadTasks();
  const task = store.tasks.find(t => t.id === id);
  if (!task) {
    throw new Error(`Task #${id} not found`);
  }
  task.status = 'done';
  saveTasks(store);
}

export function removeTask(id: number): void {
  const store = loadTasks();
  const index = store.tasks.findIndex(t => t.id === id);
  if (index === -1) {
    throw new Error(`Task #${id} not found`);
  }
  store.tasks.splice(index, 1);
  saveTasks(store);
}

export function getStats(): TaskStore {
  return loadTasks();
}
