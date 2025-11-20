import { describe, it, expect, beforeEach } from 'vitest';
import { ModelRegistry } from './model_registry.js';

describe('ModelRegistry lanes', () => {
  let registry: ModelRegistry;

  beforeEach(async () => {
    registry = new ModelRegistry(process.cwd());
    await registry.load(); // uses embedded defaults if none on disk
  });

  it('selects fast lane model', () => {
    const id = registry.getBestForLane('fast');
    expect(id).toBeDefined();
    // Allow any fast-tagged model (haiku/flash/etc.)
    expect(id?.length).toBeGreaterThan(0);
  });

  it('selects standard lane model', () => {
    const id = registry.getBestForLane('standard');
    expect(id).toBeDefined();
  });

  it('selects deep lane model', () => {
    const id = registry.getBestForLane('deep');
    expect(id).toBeDefined();
  });
});
