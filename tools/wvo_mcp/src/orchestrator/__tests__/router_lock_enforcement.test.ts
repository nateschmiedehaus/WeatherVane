import fs from 'node:fs';
import path from 'node:path';

import { describe, it, expect } from 'vitest';
import YAML from 'yaml';

import {
  ROUTER_ALLOWED_MODELS,
  ROUTER_ALLOWED_PROVIDERS,
  ROUTER_BANNED_PROVIDERS,
  normalizeRouterProvider,
} from '../router_lock.js';

const POLICY_PATH = path.resolve(__dirname, '..', 'model_policy.yaml');

describe('router lock policy', () => {
  it('model_policy.yaml only includes allow-listed models', () => {
    const policyRaw = fs.readFileSync(POLICY_PATH, 'utf-8');
    const policy = YAML.parse(policyRaw) ?? {};
    const modelNames: string[] = Array.isArray(policy.models)
      ? policy.models.map((model: { name?: string }) => model?.name).filter(Boolean)
      : [];
    const unexpected = modelNames.filter(name => !ROUTER_ALLOWED_MODELS.has(name));
    expect(unexpected).toEqual([]);
    expect(sortStrings(modelNames)).toEqual(sortStrings(Array.from(ROUTER_ALLOWED_MODELS)));
  });

  it('banned providers stay synchronized with router lock constants', () => {
    const policyRaw = fs.readFileSync(POLICY_PATH, 'utf-8');
    const policy = YAML.parse(policyRaw) ?? {};
    const banned = new Set<string>(policy.ban_providers ?? []);
    expect(banned).toEqual(ROUTER_BANNED_PROVIDERS);
  });

  it('policy providers align with router lock allow-list', () => {
    const policyRaw = fs.readFileSync(POLICY_PATH, 'utf-8');
    const policy = YAML.parse(policyRaw) ?? {};
    const providers: string[] = Array.isArray(policy.models)
      ? policy.models.map((model: { provider?: string }) => model?.provider).filter(Boolean)
      : [];
    const normalized = new Set(providers.map(provider => normalizeRouterProvider(provider)));
    expect(normalized).toEqual(ROUTER_ALLOWED_PROVIDERS);
  });
});

function sortStrings(values: string[]): string[] {
  return [...values].sort();
}
