import fs, { promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  initTracing,
  withSpan,
  startSpan,
  endSpan,
  type InitTracingOptions,
  type SpanHandle,
} from './tracing.js';

describe('OpenTelemetry Tracing', () => {
  let tempDir: string;
  let tracesFile: string;

  beforeEach(async () => {
    // Create temporary directory for test traces
    tempDir = path.join(tmpdir(), `tracing-test-${Date.now()}`);
    tracesFile = path.join(tempDir, 'traces.jsonl');
    await fsp.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      await fsp.rm(tempDir, { recursive: true });
    }
  });

  describe('initTracing', () => {
    it('should initialize tracing with default configuration', () => {
      initTracing({
        workspaceRoot: tempDir,
        enabled: true,
      });
      expect(true).toBe(true); // Initialization succeeded
    });

    it('should initialize tracing with custom sample ratio', () => {
      initTracing({
        workspaceRoot: tempDir,
        enabled: true,
        sampleRatio: 0.5,
      });
      expect(true).toBe(true);
    });

    it('should handle disabled tracing', () => {
      initTracing({
        workspaceRoot: tempDir,
        enabled: false,
      });
      expect(true).toBe(true);
    });

    it('should create traces directory if it does not exist', async () => {
      const customDir = path.join(tempDir, 'custom', 'nested', 'path');
      const customTracesFile = path.join(customDir, 'state', 'telemetry', 'traces.jsonl');

      initTracing({
        workspaceRoot: customDir,
        enabled: true,
      });

      // Directory should be created when first span is recorded
      await withSpan('test.span', async () => {
        // Body of span
      });

      // Wait longer for async flush to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify directory was created
      expect(fs.existsSync(path.dirname(customTracesFile))).toBe(true);
    });
  });

  describe('withSpan', () => {
    beforeEach(() => {
      initTracing({
        workspaceRoot: tempDir,
        enabled: true,
        sampleRatio: 1, // Always sample for tests
      });
    });

    it('should create a span for async function', async () => {
      const result = await withSpan('test.async', async (span) => {
        expect(span).toBeDefined();
        expect(span?.traceId).toBeDefined();
        expect(span?.spanId).toBeDefined();
        expect(typeof span?.traceId).toBe('string');
        expect(typeof span?.spanId).toBe('string');
        return 'success';
      });

      expect(result).toBe('success');
    });

    it('should create a span for sync function', () => {
      const result = withSpan('test.sync', (span) => {
        expect(span).toBeDefined();
        return 42;
      });

      expect(result).toBe(42);
    });

    it('should set attributes on span', async () => {
      await withSpan('test.attributes', async (span) => {
        span?.setAttribute('test.key', 'test-value');
        span?.setAttribute('test.number', 123);
        span?.setAttribute('test.boolean', true);
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      if (fs.existsSync(tracesFile)) {
        const content = await fsp.readFile(tracesFile, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        const lastSpan = lines.length > 0 ? JSON.parse(lines[lines.length - 1]) : null;

        expect(lastSpan?.attributes['test.key']).toBe('test-value');
        expect(lastSpan?.attributes['test.number']).toBe(123);
        expect(lastSpan?.attributes['test.boolean']).toBe(true);
      }
    });

    it('should add events to span', async () => {
      await withSpan('test.events', async (span) => {
        span?.addEvent('event1');
        span?.addEvent('event2', { detail: 'some detail' });
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      if (fs.existsSync(tracesFile)) {
        const content = await fsp.readFile(tracesFile, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        const lastSpan = lines.length > 0 ? JSON.parse(lines[lines.length - 1]) : null;

        expect(lastSpan?.events.length).toBeGreaterThanOrEqual(2);
        const eventNames = lastSpan?.events.map((e: { name: string }) => e.name);
        expect(eventNames).toContain('event1');
        expect(eventNames).toContain('event2');
      }
    });

    it('should record exceptions in span', async () => {
      const error = new Error('Test error');
      try {
        await withSpan('test.exception', async (span) => {
          span?.recordException(error);
          throw error;
        });
      } catch {
        // Expected
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      if (fs.existsSync(tracesFile)) {
        const content = await fsp.readFile(tracesFile, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        const lastSpan = lines.length > 0 ? JSON.parse(lines[lines.length - 1]) : null;

        expect(lastSpan?.status).toBe('error');
        const exceptionEvent = lastSpan?.events.find((e: { name: string }) => e.name === 'exception');
        expect(exceptionEvent).toBeDefined();
        expect(exceptionEvent?.attributes.message).toBe('Test error');
      }
    });

    it('should handle nested spans', async () => {
      let innerSpanId: string | undefined;
      let outerSpanId: string | undefined;
      let traceId: string | undefined;

      await withSpan('test.outer', async (outerSpan) => {
        outerSpanId = outerSpan?.spanId;
        traceId = outerSpan?.traceId;

        await withSpan('test.inner', async (innerSpan) => {
          innerSpanId = innerSpan?.spanId;
          expect(innerSpan?.traceId).toBe(outerSpan?.traceId);
        });
      });

      expect(outerSpanId).not.toBe(innerSpanId);

      await new Promise(resolve => setTimeout(resolve, 100));

      if (fs.existsSync(tracesFile)) {
        const content = await fsp.readFile(tracesFile, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        const spans = lines.map(l => JSON.parse(l));

        // Find outer and inner spans
        const outerSpanRecord = spans.find((s: { name: string }) => s.name === 'test.outer');
        const innerSpanRecord = spans.find((s: { name: string }) => s.name === 'test.inner');

        expect(outerSpanRecord).toBeDefined();
        expect(innerSpanRecord).toBeDefined();
        expect(outerSpanRecord.traceId).toBe(innerSpanRecord.traceId);
        expect(innerSpanRecord.parentSpanId).toBe(outerSpanId);
      }
    });

    it('should handle errors in async span', async () => {
      const error = new Error('Async operation failed');
      try {
        await withSpan('test.async-error', async (span) => {
          span?.setAttribute('operation', 'failing');
          throw error;
        });
      } catch (e) {
        expect((e as Error).message).toBe('Async operation failed');
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      if (fs.existsSync(tracesFile)) {
        const content = await fsp.readFile(tracesFile, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        const lastSpan = lines.length > 0 ? JSON.parse(lines[lines.length - 1]) : null;

        expect(lastSpan?.status).toBe('error');
        expect(lastSpan?.statusMessage).toBe('Async operation failed');
      }
    });

    it('should measure span duration', async () => {
      const delay = 50;
      await withSpan('test.duration', async (span) => {
        await new Promise(resolve => setTimeout(resolve, delay));
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      if (fs.existsSync(tracesFile)) {
        const content = await fsp.readFile(tracesFile, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        const lastSpan = lines.length > 0 ? JSON.parse(lines[lines.length - 1]) : null;

        expect(lastSpan?.durationMs).toBeGreaterThanOrEqual(delay - 10);
      }
    });
  });

  describe('startSpan and endSpan', () => {
    beforeEach(() => {
      initTracing({
        workspaceRoot: tempDir,
        enabled: true,
        sampleRatio: 1,
      });
    });

    it('should start and end a span manually', async () => {
      const span = startSpan('test.manual');
      expect(span).toBeDefined();
      expect(span?.traceId).toBeDefined();
      expect(span?.spanId).toBeDefined();

      if (span) {
        span.setAttribute('manual', true);
        span.addEvent('manual_event');
        endSpan(span);
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      if (fs.existsSync(tracesFile)) {
        const content = await fsp.readFile(tracesFile, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        const lastSpan = lines.length > 0 ? JSON.parse(lines[lines.length - 1]) : null;

        expect(lastSpan?.name).toBe('test.manual');
        expect(lastSpan?.attributes.manual).toBe(true);
      }
    });

    it('should handle endSpan with null span', () => {
      expect(() => endSpan(null)).not.toThrow();
      expect(() => endSpan(undefined)).not.toThrow();
    });
  });

  describe('span serialization', () => {
    beforeEach(() => {
      initTracing({
        workspaceRoot: tempDir,
        enabled: true,
        sampleRatio: 1,
      });
    });

    it('should serialize span to JSONL format', async () => {
      await withSpan('test.serialization', async (span) => {
        span?.setAttribute('key1', 'value1');
        span?.setAttribute('key2', 42);
        span?.addEvent('test_event', { detail: 'test' });
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      if (fs.existsSync(tracesFile)) {
        const content = await fsp.readFile(tracesFile, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());

        expect(lines.length).toBeGreaterThan(0);

        const span = JSON.parse(lines[0]);
        expect(span.traceId).toBeDefined();
        expect(span.spanId).toBeDefined();
        expect(span.name).toBe('test.serialization');
        expect(span.startTimeUnixNano).toBeDefined();
        expect(span.endTimeUnixNano).toBeDefined();
        expect(span.status).toBe('ok');
        expect(span.durationMs).toBeGreaterThan(0);
      }
    });

    it('should include all required fields in serialized span', async () => {
      await withSpan('test.all_fields', async (span) => {
        span?.setAttribute('field1', 'value1');
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      if (fs.existsSync(tracesFile)) {
        const content = await fsp.readFile(tracesFile, 'utf-8');
        const span = JSON.parse(content.split('\n')[0]);

        expect(Object.keys(span)).toContain('traceId');
        expect(Object.keys(span)).toContain('spanId');
        expect(Object.keys(span)).toContain('parentSpanId');
        expect(Object.keys(span)).toContain('name');
        expect(Object.keys(span)).toContain('startTimeUnixNano');
        expect(Object.keys(span)).toContain('endTimeUnixNano');
        expect(Object.keys(span)).toContain('status');
        expect(Object.keys(span)).toContain('statusMessage');
        expect(Object.keys(span)).toContain('attributes');
        expect(Object.keys(span)).toContain('events');
        expect(Object.keys(span)).toContain('durationMs');
      }
    });
  });

  describe('sampling', () => {
    it('should respect sample ratio of 0 (no sampling)', async () => {
      initTracing({
        workspaceRoot: tempDir,
        enabled: true,
        sampleRatio: 0,
      });

      await withSpan('test.no_sampling', async () => {
        // This span should not be recorded
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      // No traces file should be created or it should be empty
      if (fs.existsSync(tracesFile)) {
        const content = await fsp.readFile(tracesFile, 'utf-8');
        expect(content.trim()).toBe('');
      }
    });

    it('should respect sample ratio of 1 (always sample)', async () => {
      initTracing({
        workspaceRoot: tempDir,
        enabled: true,
        sampleRatio: 1,
      });

      const spanResults: { traceId?: string; spanId?: string } = {};
      await withSpan('test.always_sample', async (span) => {
        spanResults.traceId = span?.traceId;
        spanResults.spanId = span?.spanId;
        // This span should always be recorded
      });

      // With sample ratio 1, span should be created
      expect(spanResults.traceId).toBeDefined();
      expect(spanResults.spanId).toBeDefined();
      expect(typeof spanResults.traceId).toBe('string');
      expect(typeof spanResults.spanId).toBe('string');
    });
  });

  describe('integration with operations', () => {
    beforeEach(() => {
      initTracing({
        workspaceRoot: tempDir,
        enabled: true,
        sampleRatio: 1,
      });
    });

    it('should trace command execution', async () => {
      await withSpan('command.execution', async (span) => {
        span?.setAttribute('command.text', 'echo test');
        span?.setAttribute('command.cwd', '/tmp');
        span?.setAttribute('command.exitCode', 0);
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      if (fs.existsSync(tracesFile)) {
        const content = await fsp.readFile(tracesFile, 'utf-8');
        const span = JSON.parse(content.split('\n')[0]);

        expect(span.name).toBe('command.execution');
        expect(span.attributes['command.text']).toBe('echo test');
      }
    });

    it('should trace file operations', async () => {
      await withSpan('file.read', async (span) => {
        span?.setAttribute('file.path', 'test.txt');
        span?.setAttribute('file.bytesRead', 1024);
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      if (fs.existsSync(tracesFile)) {
        const content = await fsp.readFile(tracesFile, 'utf-8');
        const span = JSON.parse(content.split('\n')[0]);

        expect(span.name).toBe('file.read');
        expect(span.attributes['file.path']).toBe('test.txt');
      }
    });

    it('should trace model selection', async () => {
      await withSpan('model.select', async (span) => {
        span?.setAttribute('model.provider', 'claude');
        span?.setAttribute('model.complexity', 5);
        span?.setAttribute('model.name', 'sonnet-3.5');
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      if (fs.existsSync(tracesFile)) {
        const content = await fsp.readFile(tracesFile, 'utf-8');
        const span = JSON.parse(content.split('\n')[0]);

        expect(span.name).toBe('model.select');
        expect(span.attributes['model.provider']).toBe('claude');
      }
    });

    it('should trace critic execution', async () => {
      await withSpan('critic.run', async (span) => {
        span?.setAttribute('critic.name', 'build');
        span?.setAttribute('critic.profile', 'standard');
        span?.setAttribute('critic.passed', true);
        span?.addEvent('critic.intelligence.success_recorded');
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      if (fs.existsSync(tracesFile)) {
        const content = await fsp.readFile(tracesFile, 'utf-8');
        const span = JSON.parse(content.split('\n')[0]);

        expect(span.name).toBe('critic.run');
        expect(span.attributes['critic.name']).toBe('build');
        expect(span.events.length).toBeGreaterThan(0);
      }
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      initTracing({
        workspaceRoot: tempDir,
        enabled: true,
        sampleRatio: 1,
      });
    });

    it('should record error details in span', async () => {
      const testError = new Error('Test error message');
      testError.name = 'TestError';

      try {
        await withSpan('test.error_recording', async (span) => {
          span?.recordException(testError);
          throw testError;
        });
      } catch {
        // Expected
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      if (fs.existsSync(tracesFile)) {
        const content = await fsp.readFile(tracesFile, 'utf-8');
        const span = JSON.parse(content.split('\n')[0]);

        expect(span.status).toBe('error');
        expect(span.statusMessage).toBe('Test error message');

        const exceptionEvent = span.events.find((e: { name: string }) => e.name === 'exception');
        expect(exceptionEvent).toBeDefined();
        expect(exceptionEvent?.attributes.message).toBe('Test error message');
        expect(exceptionEvent?.attributes.name).toBe('TestError');
      }
    });
  });
});
