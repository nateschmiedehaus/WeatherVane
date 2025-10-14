#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const API_BASE = process.env.CONTEXT7_API_URL ?? 'https://context7.com/api/v1';
const API_KEY = process.env.CONTEXT7_API_KEY;

if (!API_KEY) {
  console.error('Missing CONTEXT7_API_KEY environment variable.');
  process.exit(1);
}

const CONFIG_PATH = path.join(process.cwd(), 'config/api-docs.json');
let config;
try {
  const raw = await readFile(CONFIG_PATH, 'utf-8');
  config = JSON.parse(raw);
} catch (error) {
  console.error(`Unable to read ${CONFIG_PATH}:`, error);
  process.exit(1);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: 'application/json',
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return response.json();
}

for (const entry of config) {
  const query = entry.query ?? entry.id;
  const outputPath = path.join(process.cwd(), entry.output);

  console.log(`Refreshing ${entry.id}...`);

  let libraryId = entry.libraryId;
  if (!libraryId) {
    const searchUrl = new URL(`${API_BASE}/search`);
    searchUrl.searchParams.set('query', query);
    const search = await fetchJson(searchUrl);
    const candidates = search?.results ?? [];
    if (candidates.length === 0) {
      throw new Error(`No search results for "${query}"`);
    }
    const normalizedId = entry.id.toLowerCase();
    const match =
      candidates.find((result) =>
        typeof result.id === 'string' && result.id.toLowerCase().includes(normalizedId)
      ) ?? candidates[0];
    libraryId = match.id;
  }

  if (!libraryId.startsWith('/')) {
    libraryId = libraryId.startsWith('http')
      ? new URL(libraryId).pathname
      : `/${libraryId.replace(/^\/+/, '')}`;
  }

  const docUrl = new URL(`${API_BASE}${libraryId}`);
  const format = entry.type ?? 'txt';
  docUrl.searchParams.set('type', format);
  docUrl.searchParams.set('tokens', String(entry.tokens ?? 5000));
  if (entry.topic) {
    docUrl.searchParams.set('topic', entry.topic);
  }

  const response = await fetch(docUrl, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  const rawBody = await response.text();
  let docText;
  if (format === 'json') {
    try {
      const parsed = JSON.parse(rawBody);
      docText = JSON.stringify(parsed, null, 2);
    } catch {
      docText = rawBody;
    }
  } else {
    docText = rawBody;
  }

  if (!docText || docText.trim().length === 0) {
    console.warn(`No documentation returned for ${entry.id}; skipping file write.`);
    continue;
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, docText, 'utf-8');
  console.log(`  ↳ ${entry.output}`);
}
