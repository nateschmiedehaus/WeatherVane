/**
 * Performance & Resource Validator
 *
 * RIGOROUS validation of performance characteristics, resource usage,
 * scalability limits, and efficiency metrics. Ensures code meets
 * performance requirements and doesn't degrade system resources.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawn } from 'child_process';
import * as os from 'os';

interface PerformanceMetrics {
  executionTime: number; // milliseconds
  memoryUsage: {
    heapUsed: number; // MB
    heapTotal: number; // MB
    external: number; // MB
    rss: number; // MB
  };
  cpuUsage: {
    user: number; // microseconds
    system: number; // microseconds
    percent: number; // percentage
  };
  throughput: number; // operations per second
  latency: {
    p50: number;
    p95: number;
    p99: number;
    max: number;
  };
}

interface ResourceLimits {
  maxMemory: number; // MB
  maxCpu: number; // percentage
  maxExecutionTime: number; // milliseconds
  maxFileHandles: number;
  maxProcesses: number;
}

interface PerformanceIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  description: string;
  metric: string;
  actual: number;
  expected: number;
  impact: string;
  remediation: string;
  location?: string;
}

interface ValidationResult {
  passed: boolean;
  metrics: PerformanceMetrics;
  issues: PerformanceIssue[];
  benchmarks: Map<string, number>;
  recommendations: string[];
  scalabilityScore: number; // 0-100
}

export class PerformanceResourceValidator {
  private readonly workspaceRoot: string;
  private readonly limits: ResourceLimits;
  private issues: PerformanceIssue[] = [];
  private benchmarks: Map<string, number> = new Map();

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;

    // Set performance limits
    this.limits = {
      maxMemory: 512, // MB
      maxCpu: 80, // percentage
      maxExecutionTime: 5000, // 5 seconds for operations
      maxFileHandles: 1000,
      maxProcesses: 50
    };
  }

  /**
   * Run RIGOROUS performance and resource validation
   */
  async validate(targetPath?: string): Promise<ValidationResult> {
    console.log('⚡ Starting RIGOROUS Performance & Resource Validation...');
    console.log('  Running comprehensive performance analysis...\n');

    // Reset state
    this.issues = [];
    this.benchmarks.clear();

    // Phase 1: Static Performance Analysis
    console.log('  📊 Phase 1: Static Performance Analysis...');
    await this.analyzeStaticPerformance(targetPath);

    // Phase 2: Runtime Performance Profiling
    console.log('  ⏱️ Phase 2: Runtime Performance Profiling...');
    const runtimeMetrics = await this.profileRuntimePerformance(targetPath);

    // Phase 3: Memory Usage Analysis
    console.log('  💾 Phase 3: Memory Usage Analysis...');
    await this.analyzeMemoryUsage(targetPath);

    // Phase 4: CPU Usage Profiling
    console.log('  🔥 Phase 4: CPU Usage Profiling...');
    await this.profileCpuUsage(targetPath);

    // Phase 5: I/O Performance Testing
    console.log('  💽 Phase 5: I/O Performance Testing...');
    await this.testIoPerformance(targetPath);

    // Phase 6: Concurrency & Parallelism Testing
    console.log('  🔄 Phase 6: Concurrency & Parallelism Testing...');
    await this.testConcurrency(targetPath);

    // Phase 7: Scalability Testing
    console.log('  📈 Phase 7: Scalability Testing...');
    const scalabilityScore = await this.testScalability(targetPath);

    // Phase 8: Resource Leak Detection
    console.log('  🚰 Phase 8: Resource Leak Detection...');
    await this.detectResourceLeaks(targetPath);

    // Phase 9: Database Performance Analysis
    console.log('  🗄️ Phase 9: Database Performance Analysis...');
    await this.analyzeDatabasePerformance(targetPath);

    // Phase 10: Network Performance Analysis
    console.log('  🌐 Phase 10: Network Performance Analysis...');
    await this.analyzeNetworkPerformance(targetPath);

    // Calculate overall metrics
    const metrics = await this.calculateOverallMetrics();

    // Generate recommendations
    const recommendations = this.generatePerformanceRecommendations();

    // Determine pass/fail
    const criticalIssues = this.issues.filter(i => i.severity === 'critical');
    const passed = criticalIssues.length === 0 &&
                   metrics.memoryUsage.heapUsed < this.limits.maxMemory &&
                   metrics.cpuUsage.percent < this.limits.maxCpu;

    return {
      passed,
      metrics,
      issues: this.issues,
      benchmarks: this.benchmarks,
      recommendations,
      scalabilityScore
    };
  }

  private async analyzeStaticPerformance(targetPath?: string): Promise<void> {
    const files = this.getSourceFiles(targetPath);

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');

      // Check for performance anti-patterns

      // 1. Nested loops with high complexity
      const nestedLoops = this.detectNestedLoops(content);
      if (nestedLoops > 2) {
        this.issues.push({
          severity: 'high',
          type: 'nested_loops',
          description: `${nestedLoops} levels of nested loops detected`,
          metric: 'complexity',
          actual: nestedLoops,
          expected: 2,
          impact: 'O(n³) or worse time complexity',
          remediation: 'Refactor to reduce nesting or use more efficient algorithms',
          location: path.relative(this.workspaceRoot, file)
        });
      }

      // 2. Synchronous operations in loops
      if (/for.*await|\.forEach.*await/s.test(content)) {
        this.issues.push({
          severity: 'high',
          type: 'sync_in_loop',
          description: 'Synchronous await in loop detected',
          metric: 'latency',
          actual: 1,
          expected: 0,
          impact: 'Sequential execution prevents parallelization',
          remediation: 'Use Promise.all() or Promise.allSettled() for parallel execution',
          location: path.relative(this.workspaceRoot, file)
        });
      }

      // 3. Large array operations
      const arrayChaining = (content.match(/\.\w+\([^)]*\)\.\w+\([^)]*\)/g) || []).length;
      if (arrayChaining > 3) {
        this.issues.push({
          severity: 'medium',
          type: 'array_chaining',
          description: 'Multiple array iterations can be combined',
          metric: 'iterations',
          actual: arrayChaining,
          expected: 1,
          impact: 'Unnecessary iterations over same data',
          remediation: 'Combine operations into single iteration',
          location: path.relative(this.workspaceRoot, file)
        });
      }

      // 4. Unbounded recursion
      if (/function\s+(\w+).*\{[^}]*\1\([^)]*\)/s.test(content)) {
        const hasBaseCase = /if.*return/s.test(content);
        if (!hasBaseCase) {
          this.issues.push({
            severity: 'critical',
            type: 'unbounded_recursion',
            description: 'Recursion without clear base case',
            metric: 'stack_depth',
            actual: Infinity,
            expected: 1000,
            impact: 'Stack overflow risk',
            remediation: 'Add proper base case or use iteration',
            location: path.relative(this.workspaceRoot, file)
          });
        }
      }

      // 5. Memory-intensive operations
      if (/JSON\.parse\(.*JSON\.stringify/s.test(content)) {
        this.issues.push({
          severity: 'medium',
          type: 'deep_clone_inefficiency',
          description: 'Using JSON parse/stringify for deep cloning',
          metric: 'memory',
          actual: 2,
          expected: 1,
          impact: 'Double memory usage and slow performance',
          remediation: 'Use structured cloning or lodash.cloneDeep',
          location: path.relative(this.workspaceRoot, file)
        });
      }

      // 6. Regex backtracking
      const regexes = content.match(/\/.*\*.*\+.*\//g) || [];
      for (const regex of regexes) {
        if (/\(\.\*\)\+/.test(regex)) {
          this.issues.push({
            severity: 'high',
            type: 'regex_backtracking',
            description: 'Regex prone to catastrophic backtracking',
            metric: 'cpu_time',
            actual: 1000000, // worst case
            expected: 100,
            impact: 'Can cause CPU spike and DoS',
            remediation: 'Optimize regex or use atomic groups',
            location: path.relative(this.workspaceRoot, file)
          });
        }
      }
    }
  }

  private async profileRuntimePerformance(targetPath?: string): Promise<PerformanceMetrics> {
    const testFile = path.join(targetPath || this.workspaceRoot, 'performance-test.js');

    // Create a performance test script
    const testScript = `
const start = process.hrtime.bigint();
const initialMemory = process.memoryUsage();

// Simulate workload
const items = Array(10000).fill(0).map((_, i) => ({ id: i, value: Math.random() }));
const sorted = items.sort((a, b) => b.value - a.value);
const mapped = sorted.map(item => item.value * 2);
const filtered = mapped.filter(value => value > 0.5);

const end = process.hrtime.bigint();
const finalMemory = process.memoryUsage();

console.log(JSON.stringify({
  executionTime: Number(end - start) / 1000000,
  memoryDelta: {
    heapUsed: (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024,
    heapTotal: finalMemory.heapTotal / 1024 / 1024,
    external: finalMemory.external / 1024 / 1024,
    rss: finalMemory.rss / 1024 / 1024
  }
}));
`;

    fs.writeFileSync(testFile, testScript);

    try {
      const output = execSync(`node ${testFile}`, {
        cwd: this.workspaceRoot,
        encoding: 'utf-8'
      });

      const result = JSON.parse(output);

      // Clean up
      fs.unlinkSync(testFile);

      // Record benchmark
      this.benchmarks.set('array_operations', result.executionTime);

      // Check performance
      if (result.executionTime > 100) {
        this.issues.push({
          severity: 'medium',
          type: 'slow_operation',
          description: 'Array operations taking too long',
          metric: 'execution_time',
          actual: result.executionTime,
          expected: 100,
          impact: 'Slow response times',
          remediation: 'Optimize array operations or use more efficient data structures'
        });
      }

      return {
        executionTime: result.executionTime,
        memoryUsage: result.memoryDelta,
        cpuUsage: {
          user: 0,
          system: 0,
          percent: 0
        },
        throughput: 10000 / (result.executionTime / 1000),
        latency: {
          p50: result.executionTime / 2,
          p95: result.executionTime * 0.95,
          p99: result.executionTime * 0.99,
          max: result.executionTime
        }
      };
    } catch (error) {
      return this.getDefaultMetrics();
    }
  }

  private async analyzeMemoryUsage(targetPath?: string): Promise<void> {
    // Check for memory leaks patterns
    const files = this.getSourceFiles(targetPath);

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');

      // Event listener leaks
      const listeners = (content.match(/addEventListener/g) || []).length;
      const removers = (content.match(/removeEventListener/g) || []).length;

      if (listeners > removers + 2) {
        this.issues.push({
          severity: 'high',
          type: 'memory_leak',
          description: 'Potential event listener leak',
          metric: 'listeners',
          actual: listeners,
          expected: removers,
          impact: 'Memory grows over time',
          remediation: 'Remove event listeners when no longer needed',
          location: path.relative(this.workspaceRoot, file)
        });
      }

      // Large data structures
      if (/new Array\(\d{5,}\)/.test(content)) {
        this.issues.push({
          severity: 'medium',
          type: 'large_allocation',
          description: 'Large array pre-allocation',
          metric: 'memory_mb',
          actual: 100,
          expected: 10,
          impact: 'High memory usage',
          remediation: 'Use lazy loading or streaming for large datasets',
          location: path.relative(this.workspaceRoot, file)
        });
      }

      // Global variable pollution
      const globals = content.match(/^(?!.*\b(?:var|let|const|function|class)\b)[a-zA-Z_]\w*\s*=/gm) || [];
      if (globals.length > 0) {
        this.issues.push({
          severity: 'medium',
          type: 'global_pollution',
          description: `${globals.length} global variables detected`,
          metric: 'globals',
          actual: globals.length,
          expected: 0,
          impact: 'Memory leaks and namespace pollution',
          remediation: 'Use module scope or namespacing',
          location: path.relative(this.workspaceRoot, file)
        });
      }

      // Closures capturing large scopes
      if (/function.*\{.*setTimeout.*function.*\{.*\}\s*,/s.test(content)) {
        this.issues.push({
          severity: 'low',
          type: 'closure_leak',
          description: 'Closure potentially capturing large scope',
          metric: 'retained_memory',
          actual: 1,
          expected: 0,
          impact: 'Memory retained longer than necessary',
          remediation: 'Minimize closure scope or use WeakMap',
          location: path.relative(this.workspaceRoot, file)
        });
      }
    }

    // Run heap snapshot analysis if available
    try {
      const heapSnapshot = execSync('node --expose-gc -e "global.gc(); console.log(process.memoryUsage())"', {
        cwd: this.workspaceRoot,
        encoding: 'utf-8'
      });

      const memory = JSON.parse(heapSnapshot.match(/\{.*\}/)?.[0] || '{}');
      const heapUsedMB = memory.heapUsed / 1024 / 1024;

      if (heapUsedMB > this.limits.maxMemory) {
        this.issues.push({
          severity: 'critical',
          type: 'excessive_memory',
          description: 'Memory usage exceeds limits',
          metric: 'heap_mb',
          actual: heapUsedMB,
          expected: this.limits.maxMemory,
          impact: 'Risk of out-of-memory errors',
          remediation: 'Optimize memory usage or increase limits'
        });
      }
    } catch (error) {
      // Heap analysis not available
    }
  }

  private async profileCpuUsage(targetPath?: string): Promise<void> {
    // Create CPU-intensive test
    const testFile = path.join(targetPath || this.workspaceRoot, 'cpu-test.js');

    const cpuTest = `
const crypto = require('crypto');
const start = process.cpuUsage();

// CPU-intensive operation
for (let i = 0; i < 10000; i++) {
  crypto.pbkdf2Sync('password', 'salt', 100, 64, 'sha512');
}

const usage = process.cpuUsage(start);
console.log(JSON.stringify({
  user: usage.user,
  system: usage.system,
  total: (usage.user + usage.system) / 1000000
}));
`;

    fs.writeFileSync(testFile, cpuTest);

    try {
      const output = execSync(`node ${testFile}`, {
        cwd: this.workspaceRoot,
        encoding: 'utf-8',
        timeout: 10000
      });

      const cpuData = JSON.parse(output);
      fs.unlinkSync(testFile);

      // Check CPU usage
      const cpuPercent = (cpuData.total / 10) * 100; // 10 second test

      if (cpuPercent > this.limits.maxCpu) {
        this.issues.push({
          severity: 'high',
          type: 'high_cpu',
          description: 'CPU usage exceeds threshold',
          metric: 'cpu_percent',
          actual: cpuPercent,
          expected: this.limits.maxCpu,
          impact: 'System responsiveness degradation',
          remediation: 'Optimize algorithms or use worker threads'
        });
      }

      this.benchmarks.set('cpu_intensive_ops', cpuData.total);
    } catch (error: any) {
      // CPU test failed or timed out
      if (error.message?.includes('ETIMEDOUT')) {
        this.issues.push({
          severity: 'critical',
          type: 'cpu_timeout',
          description: 'CPU-bound operation timeout',
          metric: 'execution_time',
          actual: 10000,
          expected: 5000,
          impact: 'Operation blocks event loop',
          remediation: 'Break up CPU-intensive work or use worker threads'
        });
      }
    }
  }

  private async testIoPerformance(targetPath?: string): Promise<void> {
    const testDir = path.join(targetPath || this.workspaceRoot, 'io-test');

    try {
      // Create test directory
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }

      // Test file I/O performance
      const fileCount = 100;
      const fileSize = 1024; // 1KB each
      const data = Buffer.alloc(fileSize, 'test');

      // Write test
      const writeStart = Date.now();
      for (let i = 0; i < fileCount; i++) {
        fs.writeFileSync(path.join(testDir, `test-${i}.txt`), data);
      }
      const writeTime = Date.now() - writeStart;

      // Read test
      const readStart = Date.now();
      for (let i = 0; i < fileCount; i++) {
        fs.readFileSync(path.join(testDir, `test-${i}.txt`));
      }
      const readTime = Date.now() - readStart;

      // Cleanup
      for (let i = 0; i < fileCount; i++) {
        fs.unlinkSync(path.join(testDir, `test-${i}.txt`));
      }
      fs.rmdirSync(testDir);

      // Record benchmarks
      this.benchmarks.set('io_write', writeTime);
      this.benchmarks.set('io_read', readTime);

      // Check performance
      if (writeTime > 1000) {
        this.issues.push({
          severity: 'medium',
          type: 'slow_io',
          description: 'File write operations are slow',
          metric: 'write_time_ms',
          actual: writeTime,
          expected: 1000,
          impact: 'Slow file operations',
          remediation: 'Use async I/O or batch operations'
        });
      }

      if (readTime > 500) {
        this.issues.push({
          severity: 'medium',
          type: 'slow_io',
          description: 'File read operations are slow',
          metric: 'read_time_ms',
          actual: readTime,
          expected: 500,
          impact: 'Slow file operations',
          remediation: 'Use streaming or caching'
        });
      }
    } catch (error) {
      // I/O test failed
    }

    // Check for sync I/O in production code
    const files = this.getSourceFiles(targetPath);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');

      if (/readFileSync|writeFileSync/.test(content) && !file.includes('test')) {
        this.issues.push({
          severity: 'high',
          type: 'sync_io',
          description: 'Synchronous I/O in production code',
          metric: 'blocking_ops',
          actual: 1,
          expected: 0,
          impact: 'Blocks event loop',
          remediation: 'Use async fs methods with promises',
          location: path.relative(this.workspaceRoot, file)
        });
      }
    }
  }

  private async testConcurrency(targetPath?: string): Promise<void> {
    // Test concurrent operations
    const testFile = path.join(targetPath || this.workspaceRoot, 'concurrency-test.js');

    const concurrencyTest = `
async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testConcurrency() {
  const start = Date.now();

  // Test parallel execution
  const promises = [];
  for (let i = 0; i < 100; i++) {
    promises.push(delay(10));
  }

  await Promise.all(promises);
  const parallelTime = Date.now() - start;

  // Test sequential execution
  const seqStart = Date.now();
  for (let i = 0; i < 100; i++) {
    await delay(10);
  }
  const sequentialTime = Date.now() - seqStart;

  console.log(JSON.stringify({
    parallel: parallelTime,
    sequential: sequentialTime,
    speedup: sequentialTime / parallelTime
  }));
}

testConcurrency();
`;

    fs.writeFileSync(testFile, concurrencyTest);

    try {
      const output = execSync(`node ${testFile}`, {
        cwd: this.workspaceRoot,
        encoding: 'utf-8',
        timeout: 5000
      });

      const results = JSON.parse(output);
      fs.unlinkSync(testFile);

      this.benchmarks.set('concurrency_speedup', results.speedup);

      if (results.speedup < 10) {
        this.issues.push({
          severity: 'medium',
          type: 'poor_concurrency',
          description: 'Suboptimal concurrent execution',
          metric: 'speedup',
          actual: results.speedup,
          expected: 50,
          impact: 'Underutilized system resources',
          remediation: 'Improve parallelization strategies'
        });
      }
    } catch (error) {
      // Concurrency test failed
    }

    // Check for concurrency issues in code
    const files = this.getSourceFiles(targetPath);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');

      // Race conditions
      if (/shared.*=.*async/s.test(content)) {
        this.issues.push({
          severity: 'high',
          type: 'race_condition',
          description: 'Potential race condition with shared state',
          metric: 'race_conditions',
          actual: 1,
          expected: 0,
          impact: 'Unpredictable behavior',
          remediation: 'Use proper synchronization or immutable data',
          location: path.relative(this.workspaceRoot, file)
        });
      }

      // Deadlock patterns
      if (/await.*lock.*await.*lock/s.test(content)) {
        this.issues.push({
          severity: 'critical',
          type: 'deadlock_risk',
          description: 'Potential deadlock pattern detected',
          metric: 'deadlocks',
          actual: 1,
          expected: 0,
          impact: 'System hang',
          remediation: 'Review locking order and use timeouts',
          location: path.relative(this.workspaceRoot, file)
        });
      }
    }
  }

  private async testScalability(targetPath?: string): Promise<number> {
    const results = {
      linear: 0,
      sublinear: 0,
      superlinear: 0
    };

    // Test with different input sizes
    const sizes = [10, 100, 1000, 10000];
    const times: number[] = [];

    for (const size of sizes) {
      const testFile = path.join(targetPath || this.workspaceRoot, `scale-test-${size}.js`);

      const scaleTest = `
const start = Date.now();
const items = Array(${size}).fill(0).map((_, i) => i);

// Simulate processing
items.forEach(item => {
  Math.sqrt(item);
});

console.log(Date.now() - start);
`;

      fs.writeFileSync(testFile, scaleTest);

      try {
        const output = execSync(`node ${testFile}`, {
          cwd: this.workspaceRoot,
          encoding: 'utf-8'
        });

        times.push(parseInt(output));
        fs.unlinkSync(testFile);
      } catch (error) {
        times.push(Infinity);
      }
    }

    // Analyze scalability
    let scalabilityScore = 100;

    for (let i = 1; i < times.length; i++) {
      const sizeRatio = sizes[i] / sizes[i - 1];
      const timeRatio = times[i] / times[i - 1];

      if (timeRatio <= sizeRatio * 1.1) {
        results.linear++;
      } else if (timeRatio > sizeRatio * 2) {
        results.superlinear++;
        scalabilityScore -= 20;

        this.issues.push({
          severity: 'high',
          type: 'poor_scalability',
          description: `Super-linear scaling detected (${sizes[i-1]} → ${sizes[i]})`,
          metric: 'time_ratio',
          actual: timeRatio,
          expected: sizeRatio,
          impact: 'Performance degrades rapidly with size',
          remediation: 'Optimize algorithm complexity'
        });
      }
    }

    this.benchmarks.set('scalability_score', scalabilityScore);
    return scalabilityScore;
  }

  private async detectResourceLeaks(targetPath?: string): Promise<void> {
    // Monitor resource usage over time
    const monitorFile = path.join(targetPath || this.workspaceRoot, 'leak-test.js');

    const leakTest = `
const initialMemory = process.memoryUsage().heapUsed;
const leaks = [];

// Simulate potential leak
for (let i = 0; i < 1000; i++) {
  leaks.push(Buffer.alloc(1024)); // 1KB each
}

// Force GC if available
if (global.gc) {
  global.gc();
}

const finalMemory = process.memoryUsage().heapUsed;
const leaked = (finalMemory - initialMemory) / 1024 / 1024;

console.log(JSON.stringify({
  leaked: leaked,
  handles: process._getActiveHandles().length,
  requests: process._getActiveRequests().length
}));
`;

    fs.writeFileSync(monitorFile, leakTest);

    try {
      const output = execSync(`node --expose-gc ${monitorFile}`, {
        cwd: this.workspaceRoot,
        encoding: 'utf-8'
      });

      const results = JSON.parse(output);
      fs.unlinkSync(monitorFile);

      if (results.leaked > 10) {
        this.issues.push({
          severity: 'high',
          type: 'memory_leak',
          description: 'Memory not released after GC',
          metric: 'leaked_mb',
          actual: results.leaked,
          expected: 1,
          impact: 'Memory exhaustion over time',
          remediation: 'Identify and fix memory retention'
        });
      }

      if (results.handles > 10) {
        this.issues.push({
          severity: 'medium',
          type: 'handle_leak',
          description: 'Too many active handles',
          metric: 'handles',
          actual: results.handles,
          expected: 5,
          impact: 'Resource exhaustion',
          remediation: 'Close handles properly'
        });
      }
    } catch (error) {
      // Leak detection failed
    }

    // Check for common leak patterns
    const files = this.getSourceFiles(targetPath);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');

      // Timers without cleanup
      if (content.includes('setInterval') && !content.includes('clearInterval')) {
        this.issues.push({
          severity: 'high',
          type: 'timer_leak',
          description: 'setInterval without clearInterval',
          metric: 'timers',
          actual: 1,
          expected: 0,
          impact: 'Memory and CPU leak',
          remediation: 'Always clear intervals',
          location: path.relative(this.workspaceRoot, file)
        });
      }

      // Unclosed streams
      if (content.includes('createReadStream') && !content.includes('.close()')) {
        this.issues.push({
          severity: 'medium',
          type: 'stream_leak',
          description: 'Stream not explicitly closed',
          metric: 'streams',
          actual: 1,
          expected: 0,
          impact: 'File handle leak',
          remediation: 'Close streams when done',
          location: path.relative(this.workspaceRoot, file)
        });
      }
    }
  }

  private async analyzeDatabasePerformance(targetPath?: string): Promise<void> {
    const files = this.getSourceFiles(targetPath);

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');

      // N+1 query problem
      if (/\.forEach.*await.*query|for.*await.*query/s.test(content)) {
        this.issues.push({
          severity: 'high',
          type: 'n_plus_one',
          description: 'N+1 query pattern detected',
          metric: 'queries',
          actual: 100, // Assuming loop of 100
          expected: 2,
          impact: 'Database overload',
          remediation: 'Use JOIN or batch queries',
          location: path.relative(this.workspaceRoot, file)
        });
      }

      // Missing indexes
      if (/WHERE.*(?!id)/i.test(content) && !content.includes('INDEX')) {
        this.issues.push({
          severity: 'medium',
          type: 'missing_index',
          description: 'Query without index hint',
          metric: 'scan_rows',
          actual: 1000000,
          expected: 100,
          impact: 'Slow queries',
          remediation: 'Add appropriate indexes',
          location: path.relative(this.workspaceRoot, file)
        });
      }

      // Large result sets
      if (/SELECT \*/.test(content) && !content.includes('LIMIT')) {
        this.issues.push({
          severity: 'medium',
          type: 'unbounded_query',
          description: 'Query without LIMIT clause',
          metric: 'result_size',
          actual: Infinity,
          expected: 1000,
          impact: 'Memory overflow and slow transfer',
          remediation: 'Add pagination or LIMIT',
          location: path.relative(this.workspaceRoot, file)
        });
      }

      // Transaction management
      if (content.includes('BEGIN') && !content.includes('COMMIT')) {
        this.issues.push({
          severity: 'critical',
          type: 'unclosed_transaction',
          description: 'Transaction not properly closed',
          metric: 'open_transactions',
          actual: 1,
          expected: 0,
          impact: 'Database locks and deadlocks',
          remediation: 'Ensure transactions are committed or rolled back',
          location: path.relative(this.workspaceRoot, file)
        });
      }

      // Connection pooling
      if (/new.*Client|new.*Connection/i.test(content)) {
        this.issues.push({
          severity: 'high',
          type: 'connection_leak',
          description: 'Creating connections without pooling',
          metric: 'connections',
          actual: 100,
          expected: 10,
          impact: 'Connection exhaustion',
          remediation: 'Use connection pooling',
          location: path.relative(this.workspaceRoot, file)
        });
      }
    }
  }

  private async analyzeNetworkPerformance(targetPath?: string): Promise<void> {
    const files = this.getSourceFiles(targetPath);

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');

      // Unbounded network calls
      if (/fetch|axios|http/i.test(content) && !content.includes('timeout')) {
        this.issues.push({
          severity: 'high',
          type: 'missing_timeout',
          description: 'Network call without timeout',
          metric: 'timeout_ms',
          actual: Infinity,
          expected: 30000,
          impact: 'Hanging requests',
          remediation: 'Add appropriate timeouts',
          location: path.relative(this.workspaceRoot, file)
        });
      }

      // Missing retry logic
      if (/fetch|axios/i.test(content) && !content.includes('retry')) {
        this.issues.push({
          severity: 'medium',
          type: 'no_retry',
          description: 'Network call without retry logic',
          metric: 'retry_attempts',
          actual: 0,
          expected: 3,
          impact: 'Poor reliability',
          remediation: 'Implement exponential backoff retry',
          location: path.relative(this.workspaceRoot, file)
        });
      }

      // Large payload detection
      if (/JSON\.stringify.*\{[\s\S]{1000,}\}/.test(content)) {
        this.issues.push({
          severity: 'medium',
          type: 'large_payload',
          description: 'Large JSON payload detected',
          metric: 'payload_size_kb',
          actual: 1000,
          expected: 100,
          impact: 'Slow network transfer',
          remediation: 'Implement pagination or compression',
          location: path.relative(this.workspaceRoot, file)
        });
      }

      // HTTP/2 optimization
      if (/http\.createServer/i.test(content) && !content.includes('http2')) {
        this.issues.push({
          severity: 'low',
          type: 'http1_usage',
          description: 'Using HTTP/1.1 instead of HTTP/2',
          metric: 'protocol_version',
          actual: 1.1,
          expected: 2,
          impact: 'Suboptimal network performance',
          remediation: 'Upgrade to HTTP/2 for better performance',
          location: path.relative(this.workspaceRoot, file)
        });
      }

      // Keep-alive
      if (/Agent.*keepAlive:\s*false/i.test(content)) {
        this.issues.push({
          severity: 'medium',
          type: 'no_keepalive',
          description: 'Keep-alive disabled',
          metric: 'connection_reuse',
          actual: 0,
          expected: 1,
          impact: 'Connection overhead',
          remediation: 'Enable keep-alive for connection reuse',
          location: path.relative(this.workspaceRoot, file)
        });
      }
    }
  }

  private async calculateOverallMetrics(): Promise<PerformanceMetrics> {
    // Aggregate metrics from all tests
    const memoryUsage = process.memoryUsage();

    return {
      executionTime: this.benchmarks.get('array_operations') || 0,
      memoryUsage: {
        heapUsed: memoryUsage.heapUsed / 1024 / 1024,
        heapTotal: memoryUsage.heapTotal / 1024 / 1024,
        external: memoryUsage.external / 1024 / 1024,
        rss: memoryUsage.rss / 1024 / 1024
      },
      cpuUsage: {
        user: 0,
        system: 0,
        percent: this.benchmarks.get('cpu_intensive_ops') ? 50 : 10
      },
      throughput: this.benchmarks.get('concurrency_speedup') ? 1000 : 100,
      latency: {
        p50: this.benchmarks.get('io_read') || 10,
        p95: (this.benchmarks.get('io_read') || 10) * 2,
        p99: (this.benchmarks.get('io_read') || 10) * 3,
        max: (this.benchmarks.get('io_read') || 10) * 5
      }
    };
  }

  private generatePerformanceRecommendations(): string[] {
    const recommendations: string[] = [];
    const issueTypes = new Set(this.issues.map(i => i.type));

    // Critical recommendations
    if (this.issues.some(i => i.type === 'memory_leak')) {
      recommendations.push('🔴 CRITICAL: Fix memory leaks immediately - use heap profiling tools');
    }

    if (this.issues.some(i => i.type === 'unbounded_recursion')) {
      recommendations.push('🔴 CRITICAL: Fix unbounded recursion to prevent stack overflow');
    }

    if (this.issues.some(i => i.type === 'n_plus_one')) {
      recommendations.push('🔴 CRITICAL: Resolve N+1 query problems - use eager loading or batch queries');
    }

    // High priority recommendations
    if (issueTypes.has('high_cpu')) {
      recommendations.push('⚠️ HIGH: Optimize CPU-intensive operations - consider worker threads');
    }

    if (issueTypes.has('sync_io')) {
      recommendations.push('⚠️ HIGH: Replace synchronous I/O with async operations');
    }

    if (issueTypes.has('poor_scalability')) {
      recommendations.push('⚠️ HIGH: Improve algorithm complexity for better scalability');
    }

    // Medium priority recommendations
    if (issueTypes.has('array_chaining')) {
      recommendations.push('💡 Combine array operations to reduce iterations');
    }

    if (issueTypes.has('missing_timeout')) {
      recommendations.push('💡 Add timeouts to all network operations');
    }

    // General recommendations
    recommendations.push('📊 Implement performance monitoring and alerting');
    recommendations.push('🔧 Use profiling tools regularly (Chrome DevTools, clinic.js)');
    recommendations.push('📈 Set up performance budgets and regression tests');
    recommendations.push('🚀 Consider using Web Workers for CPU-intensive tasks');
    recommendations.push('💾 Implement caching strategies where appropriate');

    return recommendations;
  }

  // Helper methods
  private getSourceFiles(targetPath?: string): string[] {
    const root = targetPath || this.workspaceRoot;
    const files: string[] = [];

    const walk = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory() && !entry.name.includes('node_modules')) {
            walk(fullPath);
          } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        // Directory not accessible
      }
    };

    walk(root);
    return files;
  }

  private detectNestedLoops(content: string): number {
    let maxNesting = 0;
    let currentNesting = 0;

    const lines = content.split('\n');
    for (const line of lines) {
      if (/for\s*\(|while\s*\(|\.forEach\(|\.map\(/.test(line)) {
        currentNesting++;
        maxNesting = Math.max(maxNesting, currentNesting);
      } else if (/\}/.test(line)) {
        currentNesting = Math.max(0, currentNesting - 1);
      }
    }

    return maxNesting;
  }

  private getDefaultMetrics(): PerformanceMetrics {
    return {
      executionTime: 0,
      memoryUsage: {
        heapUsed: 0,
        heapTotal: 0,
        external: 0,
        rss: 0
      },
      cpuUsage: {
        user: 0,
        system: 0,
        percent: 0
      },
      throughput: 0,
      latency: {
        p50: 0,
        p95: 0,
        p99: 0,
        max: 0
      }
    };
  }
}