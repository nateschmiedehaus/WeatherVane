import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    include: [
      'tools/wvo_mcp/src/**/*.{test,spec}.ts',
      'tests/autopilot/**/*.{test,spec}.ts'
    ],
    exclude: [
      '**/dist/**',
      '**/.cache/**',
      'apps/web/**',
      'tests/web/**',
      'node_modules/**'
    ],
    environment: 'node',
    watch: false,
    allowOnly: false,
    reporters: 'default'
  }
});
