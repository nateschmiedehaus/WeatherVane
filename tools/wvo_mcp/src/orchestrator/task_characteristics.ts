import type { Task } from './state_machine.js';

const ARCHITECTURE_KEYWORDS = [
  'architecture',
  'system design',
  'site map',
  'component map',
  'information architecture',
  'foundations',
  'wireframe',
  'planning doc',
  'blueprint',
  'layout',
  'autopilot architecture',
  'orchestrator design',
  'web architecture',
];

export function isArchitectureTask(task: Task): boolean {
  const metadata = (task.metadata as Record<string, unknown> | undefined) ?? {};
  if (metadata.requires_architecture_lane === true) {
    return true;
  }
  if (metadata.domain && String(metadata.domain).toLowerCase().includes('architecture')) {
    return true;
  }

  const text = `${task.title ?? ''} ${task.description ?? ''}`.toLowerCase();
  return ARCHITECTURE_KEYWORDS.some(keyword => text.includes(keyword));
}

export function isArchitectureReviewTask(task: Task): boolean {
  if (!isArchitectureTask(task)) {
    return false;
  }

  const text = `${task.title ?? ''}`.toLowerCase();
  const reviewKeywords = ['review', 'critique', 'validation', 'sign-off'];
  return task.status === 'needs_review' || reviewKeywords.some(keyword => text.includes(keyword));
}
