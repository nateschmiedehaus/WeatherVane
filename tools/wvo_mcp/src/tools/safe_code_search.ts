import path from 'path';

import { SafeCodeSearchIndex } from '../utils/safe_code_search';

let searchIndex: SafeCodeSearchIndex | null = null;

export async function initializeSearch(options?: { rootDir?: string; dbPath?: string }) {
  if (!searchIndex) {
    const dbPath = options?.dbPath ?? path.join(process.cwd(), 'state', 'orchestrator.db');
    const rootDir = options?.rootDir ?? process.cwd();
    searchIndex = new SafeCodeSearchIndex(dbPath, { rootDir });
    await searchIndex.refresh(); // Initial index build
  }
}

export function resetSearch() {
  if (searchIndex) {
    searchIndex.close();
    searchIndex = null;
  }
}

export interface SearchCodeParams {
  query: string;
  languages?: string[];
  limit?: number;
  after?: number;
}

export async function searchCode(params: SearchCodeParams) {
  await initializeSearch();

  if (!searchIndex) {
    throw new Error('Search index not initialized');
  }

  return searchIndex.search(params.query, {
    languages: params.languages,
    limit: params.limit,
    after: params.after
  });
}

export function getSearchMetadata() {
  if (!searchIndex) {
    throw new Error('Search index not initialized');
  }

  return searchIndex.getMetadata();
}

// Clean up on process exit
process.on('beforeExit', () => {
  if (searchIndex) {
    searchIndex.close();
    searchIndex = null;
  }
});