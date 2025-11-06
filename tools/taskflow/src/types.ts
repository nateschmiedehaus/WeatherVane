export interface Task {
  id: number;
  description: string;
  status: 'pending' | 'done';
  createdAt: string;
}

export interface TaskStore {
  tasks: Task[];
  nextId: number;
}
