import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Resource management to prevent crashes
    maxConcurrency: 5,  // Limit parallel test files
    maxWorkers: 2,      // Limit worker processes
    isolate: true,      // Isolate test environments
    pool: 'forks',      // Use fork pool for better isolation
    poolOptions: {
      forks: {
        maxForks: 2,      // Maximum 2 fork processes
        minForks: 1,
      }
    },

    // Timeout configurations
    testTimeout: 30000,   // 30s per test
    hookTimeout: 10000,   // 10s for hooks

    // Memory management
    globals: false,       // Don't pollute global scope
    clearMocks: true,     // Clear mocks after each test
    mockReset: true,      // Reset mocks after each test
    restoreMocks: true,   // Restore original implementations

    // Reporting
    reporters: ['default'],

    // Coverage
    coverage: {
      enabled: false,     // Disable coverage to save memory
    }
  }
});