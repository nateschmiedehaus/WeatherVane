import fs from 'fs';
import { TaskStore } from './types';

const STORAGE_FILE = '.taskflow.json';

export function initStorage(): void {
  if (storageExists()) {
    throw new Error('.taskflow.json already exists');
  }
  const initialStore: TaskStore = { tasks: [], nextId: 1 };
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(initialStore, null, 2));
}

export function storageExists(): boolean {
  return fs.existsSync(STORAGE_FILE);
}

export function loadTasks(): TaskStore {
  if (!storageExists()) {
    throw new Error('.taskflow.json not found. Run "taskflow init" first.');
  }
  const data = fs.readFileSync(STORAGE_FILE, 'utf-8');
  try {
    return JSON.parse(data);
  } catch (error) {
    throw new Error('Failed to parse .taskflow.json. File may be corrupted.');
  }
}

export function saveTasks(store: TaskStore): void {
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(store, null, 2));
}
