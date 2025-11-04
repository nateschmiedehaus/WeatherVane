import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getPersonaHashingMode, isPersonaHashingEnabled } from '../config';

describe('Persona Hashing Feature Flag (IMP-22)', () => {
  const originalEnv = process.env.PERSONA_HASHING_MODE;

  afterEach(() => {
    // Restore original environment
    if (originalEnv !== undefined) {
      process.env.PERSONA_HASHING_MODE = originalEnv;
    } else {
      delete process.env.PERSONA_HASHING_MODE;
    }
  });

  describe('getPersonaHashingMode', () => {
    it('should default to "off" when env var not set', () => {
      delete process.env.PERSONA_HASHING_MODE;
      expect(getPersonaHashingMode()).toBe('off');
    });

    it('should return "observe" when env var is "observe"', () => {
      process.env.PERSONA_HASHING_MODE = 'observe';
      expect(getPersonaHashingMode()).toBe('observe');
    });

    it('should return "observe" when env var is "OBSERVE" (case insensitive)', () => {
      process.env.PERSONA_HASHING_MODE = 'OBSERVE';
      expect(getPersonaHashingMode()).toBe('observe');
    });

    it('should return "enforce" when env var is "enforce"', () => {
      process.env.PERSONA_HASHING_MODE = 'enforce';
      expect(getPersonaHashingMode()).toBe('enforce');
    });

    it('should return "enforce" when env var is "ENFORCE" (case insensitive)', () => {
      process.env.PERSONA_HASHING_MODE = 'ENFORCE';
      expect(getPersonaHashingMode()).toBe('enforce');
    });

    it('should default to "off" for invalid values', () => {
      process.env.PERSONA_HASHING_MODE = 'invalid';
      expect(getPersonaHashingMode()).toBe('off');
    });

    it('should default to "off" for empty string', () => {
      process.env.PERSONA_HASHING_MODE = '';
      expect(getPersonaHashingMode()).toBe('off');
    });
  });

  describe('isPersonaHashingEnabled', () => {
    it('should return false when mode is "off"', () => {
      delete process.env.PERSONA_HASHING_MODE;
      expect(isPersonaHashingEnabled()).toBe(false);
    });

    it('should return true when mode is "observe"', () => {
      process.env.PERSONA_HASHING_MODE = 'observe';
      expect(isPersonaHashingEnabled()).toBe(true);
    });

    it('should return true when mode is "enforce"', () => {
      process.env.PERSONA_HASHING_MODE = 'enforce';
      expect(isPersonaHashingEnabled()).toBe(true);
    });

    it('should return false for invalid values', () => {
      process.env.PERSONA_HASHING_MODE = 'invalid';
      expect(isPersonaHashingEnabled()).toBe(false);
    });
  });

  describe('Feature Flag Integration', () => {
    it('should support gradual rollout: off → observe → enforce', () => {
      // Phase 1: Off (default, safe)
      delete process.env.PERSONA_HASHING_MODE;
      expect(getPersonaHashingMode()).toBe('off');
      expect(isPersonaHashingEnabled()).toBe(false);

      // Phase 2: Observe (collect data, no blocking)
      process.env.PERSONA_HASHING_MODE = 'observe';
      expect(getPersonaHashingMode()).toBe('observe');
      expect(isPersonaHashingEnabled()).toBe(true);

      // Phase 3: Enforce (block on high drift, future)
      process.env.PERSONA_HASHING_MODE = 'enforce';
      expect(getPersonaHashingMode()).toBe('enforce');
      expect(isPersonaHashingEnabled()).toBe(true);
    });
  });
});
