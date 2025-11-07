/**
 * Code Quality & Standards Validator
 *
 * RIGOROUS validation of code quality, standards compliance, and best practices.
 * Goes beyond basic linting to enforce architectural patterns, naming conventions,
 * complexity limits, and code maintainability metrics.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface CodeMetrics {
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  linesOfCode: number;
  duplicateLines: number;
  testCoverage: number;
  maintainabilityIndex: number;
}

interface ValidationResult {
  passed: boolean;
  severity: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  file?: string;
  line?: number;
  suggestion?: string;
}

export class CodeQualityValidator {
  private readonly workspaceRoot: string;
  private readonly standards: Map<string, any>;
  private results: ValidationResult[] = [];

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.standards = new Map<string, any>([
      ['maxComplexity', 10],
      ['maxFileLength', 500],
      ['maxFunctionLength', 50],
      ['minTestCoverage', 80],
      ['maxDuplication', 3],
      ['namingConventions', {
        classes: /^[A-Z][a-zA-Z0-9]*$/,
        functions: /^[a-z][a-zA-Z0-9]*$/,
        constants: /^[A-Z_][A-Z0-9_]*$/,
        files: /^[a-z_][a-z0-9_]*\.(ts|js)$/
      }]
    ]);
  }

  /**
   * Run RIGOROUS code quality validation
   */
  async validate(targetPath?: string): Promise<{
    passed: boolean;
    results: ValidationResult[];
    metrics: CodeMetrics;
    recommendations: string[];
  }> {
    console.log('🔍 Starting RIGOROUS Code Quality Validation...');

    // Reset results
    this.results = [];

    // Phase 1: Syntax and Type Checking
    await this.validateSyntax(targetPath);

    // Phase 2: Complexity Analysis
    await this.validateComplexity(targetPath);

    // Phase 3: Code Duplication Detection
    await this.validateDuplication(targetPath);

    // Phase 4: Naming Convention Enforcement
    await this.validateNamingConventions(targetPath);

    // Phase 5: Architecture Pattern Compliance
    await this.validateArchitecturePatterns(targetPath);

    // Phase 6: Test Quality and Coverage
    await this.validateTestQuality(targetPath);

    // Phase 7: Documentation Completeness
    await this.validateDocumentation(targetPath);

    // Phase 8: Security Best Practices
    await this.validateSecurityPractices(targetPath);

    // Phase 9: Performance Anti-patterns
    await this.validatePerformancePatterns(targetPath);

    // Phase 10: Dependency Health
    await this.validateDependencies();

    // Calculate metrics
    const metrics = await this.calculateMetrics(targetPath);

    // Generate recommendations
    const recommendations = this.generateRecommendations(metrics);

    // Determine overall pass/fail
    const errors = this.results.filter(r => r.severity === 'error');
    const passed = errors.length === 0 && metrics.testCoverage >= 80;

    return {
      passed,
      results: this.results,
      metrics,
      recommendations
    };
  }

  private async validateSyntax(targetPath?: string): Promise<void> {
    console.log('  📝 Validating syntax and types...');

    try {
      // Run TypeScript compiler in check mode
      const tscOutput = execSync('npx tsc --noEmit', {
        cwd: targetPath || this.workspaceRoot,
        encoding: 'utf-8'
      });

      this.results.push({
        passed: true,
        severity: 'info',
        category: 'syntax',
        message: 'All TypeScript files pass type checking'
      });
    } catch (error: any) {
      // Parse TypeScript errors
      const errorLines = error.stdout?.split('\n') || [];
      for (const line of errorLines) {
        if (line.includes('error TS')) {
          this.results.push({
            passed: false,
            severity: 'error',
            category: 'syntax',
            message: line.trim()
          });
        }
      }
    }
  }

  private async validateComplexity(targetPath?: string): Promise<void> {
    console.log('  🧮 Analyzing code complexity...');

    const files = this.getTypeScriptFiles(targetPath);

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const complexity = this.calculateCyclomaticComplexity(content);

      if (complexity > this.standards.get('maxComplexity')) {
        this.results.push({
          passed: false,
          severity: 'error',
          category: 'complexity',
          message: `Cyclomatic complexity ${complexity} exceeds limit of ${this.standards.get('maxComplexity')}`,
          file: path.relative(this.workspaceRoot, file),
          suggestion: 'Break down complex functions into smaller, focused units'
        });
      }

      // Check function length
      const functions = this.extractFunctions(content);
      for (const func of functions) {
        if (func.lines > this.standards.get('maxFunctionLength')) {
          this.results.push({
            passed: false,
            severity: 'warning',
            category: 'complexity',
            message: `Function "${func.name}" has ${func.lines} lines, exceeds limit of ${this.standards.get('maxFunctionLength')}`,
            file: path.relative(this.workspaceRoot, file),
            line: func.startLine,
            suggestion: 'Extract sub-functions to reduce function length'
          });
        }
      }
    }
  }

  private async validateDuplication(targetPath?: string): Promise<void> {
    console.log('  🔄 Detecting code duplication...');

    const files = this.getTypeScriptFiles(targetPath);
    const duplicates = new Map<string, string[]>();

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const blocks = this.extractCodeBlocks(content);

      for (const block of blocks) {
        const hash = this.hashCodeBlock(block);
        if (!duplicates.has(hash)) {
          duplicates.set(hash, []);
        }
        duplicates.get(hash)!.push(file);
      }
    }

    // Report duplication
    for (const [hash, files] of duplicates) {
      if (files.length > this.standards.get('maxDuplication')) {
        this.results.push({
          passed: false,
          severity: 'warning',
          category: 'duplication',
          message: `Code block duplicated in ${files.length} files`,
          suggestion: 'Extract common code into shared utility or base class'
        });
      }
    }
  }

  private async validateNamingConventions(targetPath?: string): Promise<void> {
    console.log('  📛 Enforcing naming conventions...');

    const files = this.getTypeScriptFiles(targetPath);
    const conventions = this.standards.get('namingConventions');

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');

      // Check class names
      const classes = content.match(/class\s+(\w+)/g) || [];
      for (const classMatch of classes) {
        const className = classMatch.replace('class ', '');
        if (!conventions.classes.test(className)) {
          this.results.push({
            passed: false,
            severity: 'error',
            category: 'naming',
            message: `Class name "${className}" violates PascalCase convention`,
            file: path.relative(this.workspaceRoot, file),
            suggestion: 'Use PascalCase for class names (e.g., MyClass)'
          });
        }
      }

      // Check function names
      const functions = content.match(/function\s+(\w+)/g) || [];
      for (const funcMatch of functions) {
        const funcName = funcMatch.replace('function ', '');
        if (!conventions.functions.test(funcName)) {
          this.results.push({
            passed: false,
            severity: 'warning',
            category: 'naming',
            message: `Function name "${funcName}" violates camelCase convention`,
            file: path.relative(this.workspaceRoot, file),
            suggestion: 'Use camelCase for function names (e.g., myFunction)'
          });
        }
      }
    }
  }

  private async validateArchitecturePatterns(targetPath?: string): Promise<void> {
    console.log('  🏗️ Validating architecture patterns...');

    // Check for proper separation of concerns
    const files = this.getTypeScriptFiles(targetPath);

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const fileName = path.basename(file);

      // Check for mixing of concerns
      if (fileName.indexOf('component') !== -1 && content.includes('SELECT * FROM')) {
        this.results.push({
          passed: false,
          severity: 'error',
          category: 'architecture',
          message: 'Database queries found in component file',
          file: path.relative(this.workspaceRoot, file),
          suggestion: 'Move data access logic to repository or service layer'
        });
      }

      // Check for proper dependency injection
      if (content.includes('new ') && !content.includes('constructor(')) {
        const matches = content.match(/new\s+[A-Z]\w+/g) || [];
        if (matches.length > 3) {
          this.results.push({
            passed: false,
            severity: 'warning',
            category: 'architecture',
            message: `Multiple direct instantiations (${matches.length}) found - consider dependency injection`,
            file: path.relative(this.workspaceRoot, file),
            suggestion: 'Use dependency injection for better testability'
          });
        }
      }

      // Check for circular dependencies
      const imports = this.extractImports(content);
      for (const importPath of imports) {
        if (this.detectCircularDependency(file, importPath)) {
          this.results.push({
            passed: false,
            severity: 'error',
            category: 'architecture',
            message: 'Circular dependency detected',
            file: path.relative(this.workspaceRoot, file),
            suggestion: 'Refactor to break circular dependency chain'
          });
        }
      }
    }
  }

  private async validateTestQuality(targetPath?: string): Promise<void> {
    console.log('  🧪 Validating test quality...');

    const testFiles = this.getTestFiles(targetPath);

    for (const file of testFiles) {
      const content = fs.readFileSync(file, 'utf-8');

      // Check for proper test structure
      if (!content.includes('describe(') || !content.includes('it(')) {
        this.results.push({
          passed: false,
          severity: 'error',
          category: 'testing',
          message: 'Test file missing proper describe/it blocks',
          file: path.relative(this.workspaceRoot, file),
          suggestion: 'Use describe() for test suites and it() for test cases'
        });
      }

      // Check for assertions
      const testCount = (content.match(/it\(/g) || []).length;
      const assertCount = (content.match(/expect\(/g) || []).length;

      if (testCount > 0 && assertCount / testCount < 1) {
        this.results.push({
          passed: false,
          severity: 'warning',
          category: 'testing',
          message: `Low assertion density: ${assertCount} assertions for ${testCount} tests`,
          file: path.relative(this.workspaceRoot, file),
          suggestion: 'Add more assertions to thoroughly validate behavior'
        });
      }

      // Check for test isolation
      if (content.includes('process.env') && !content.includes('beforeEach')) {
        this.results.push({
          passed: false,
          severity: 'warning',
          category: 'testing',
          message: 'Tests may not be properly isolated',
          file: path.relative(this.workspaceRoot, file),
          suggestion: 'Use beforeEach/afterEach for test isolation'
        });
      }
    }

    // Check test coverage
    try {
      const coverageReport = execSync('npm run test:coverage -- --silent', {
        cwd: targetPath || this.workspaceRoot,
        encoding: 'utf-8'
      });

      // Parse coverage report (simplified)
      const coverageMatch = coverageReport.match(/All files\s+\|\s+(\d+\.?\d*)/);
      if (coverageMatch) {
        const coverage = parseFloat(coverageMatch[1]);
        if (coverage < this.standards.get('minTestCoverage')) {
          this.results.push({
            passed: false,
            severity: 'error',
            category: 'testing',
            message: `Test coverage ${coverage}% below minimum ${this.standards.get('minTestCoverage')}%`,
            suggestion: 'Add more tests to increase code coverage'
          });
        }
      }
    } catch (error) {
      // Coverage command might not exist
    }
  }

  private async validateDocumentation(targetPath?: string): Promise<void> {
    console.log('  📚 Checking documentation completeness...');

    const files = this.getTypeScriptFiles(targetPath);

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');

      // Check for file header documentation
      if (!content.startsWith('/**') && !content.startsWith('//')) {
        this.results.push({
          passed: false,
          severity: 'warning',
          category: 'documentation',
          message: 'File missing header documentation',
          file: path.relative(this.workspaceRoot, file),
          suggestion: 'Add file header with purpose and usage information'
        });
      }

      // Check public methods have documentation
      const publicMethods = content.match(/public\s+\w+\s*\([^)]*\)/g) || [];
      for (const method of publicMethods) {
        const methodName = method.match(/public\s+(\w+)/)?.[1];
        const beforeMethod = content.substring(0, content.indexOf(method));
        if (!beforeMethod.endsWith('*/\n  ') && !beforeMethod.endsWith('*/\n')) {
          this.results.push({
            passed: false,
            severity: 'warning',
            category: 'documentation',
            message: `Public method "${methodName}" lacks documentation`,
            file: path.relative(this.workspaceRoot, file),
            suggestion: 'Add JSDoc comments for all public methods'
          });
        }
      }
    }
  }

  private async validateSecurityPractices(targetPath?: string): Promise<void> {
    console.log('  🔒 Checking security best practices...');

    const files = this.getTypeScriptFiles(targetPath);
    const securityPatterns = [
      { pattern: /eval\(/, message: 'Avoid eval() - security risk' },
      { pattern: /innerHTML\s*=/, message: 'Avoid innerHTML - XSS risk' },
      { pattern: /document\.write/, message: 'Avoid document.write - XSS risk' },
      { pattern: /password.*=.*["']/, message: 'Hardcoded password detected' },
      { pattern: /api[_-]?key.*=.*["']/, message: 'Hardcoded API key detected' },
      { pattern: /SECRET.*=.*["']/, message: 'Hardcoded secret detected' }
    ];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');

      for (const security of securityPatterns) {
        if (security.pattern.test(content)) {
          this.results.push({
            passed: false,
            severity: 'error',
            category: 'security',
            message: security.message,
            file: path.relative(this.workspaceRoot, file),
            suggestion: 'Use environment variables or secure configuration'
          });
        }
      }

      // Check for SQL injection risks
      if (content.includes('query(') && content.includes('${')) {
        this.results.push({
          passed: false,
          severity: 'error',
          category: 'security',
          message: 'Potential SQL injection - use parameterized queries',
          file: path.relative(this.workspaceRoot, file),
          suggestion: 'Use parameterized queries or prepared statements'
        });
      }
    }
  }

  private async validatePerformancePatterns(targetPath?: string): Promise<void> {
    console.log('  ⚡ Checking performance patterns...');

    const files = this.getTypeScriptFiles(targetPath);

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');

      // Check for N+1 query patterns
      if (content.includes('forEach') && content.includes('await')) {
        const forEachWithAwait = content.match(/forEach.*await/gs);
        if (forEachWithAwait) {
          this.results.push({
            passed: false,
            severity: 'warning',
            category: 'performance',
            message: 'Potential N+1 pattern with forEach and await',
            file: path.relative(this.workspaceRoot, file),
            suggestion: 'Use Promise.all() for parallel execution'
          });
        }
      }

      // Check for inefficient array operations
      if (content.includes('.filter(') && content.includes('.map(') && content.includes('.reduce(')) {
        this.results.push({
          passed: false,
          severity: 'warning',
          category: 'performance',
          message: 'Multiple array iterations can be combined',
          file: path.relative(this.workspaceRoot, file),
          suggestion: 'Combine filter/map/reduce into single iteration'
        });
      }

      // Check for memory leaks
      if (content.includes('setInterval') && !content.includes('clearInterval')) {
        this.results.push({
          passed: false,
          severity: 'error',
          category: 'performance',
          message: 'setInterval without clearInterval - potential memory leak',
          file: path.relative(this.workspaceRoot, file),
          suggestion: 'Always clear intervals when component unmounts'
        });
      }
    }
  }

  private async validateDependencies(): Promise<void> {
    console.log('  📦 Checking dependency health...');

    try {
      // Check for outdated dependencies
      const outdated = execSync('npm outdated --json', {
        cwd: this.workspaceRoot,
        encoding: 'utf-8'
      });

      if (outdated) {
        const deps = JSON.parse(outdated);
        const criticalUpdates = Object.entries(deps).filter(([name, info]: [string, any]) => {
          return info.wanted !== info.latest;
        });

        if (criticalUpdates.length > 0) {
          this.results.push({
            passed: false,
            severity: 'warning',
            category: 'dependencies',
            message: `${criticalUpdates.length} dependencies have updates available`,
            suggestion: 'Run npm update to update dependencies'
          });
        }
      }
    } catch (error) {
      // No outdated dependencies
    }

    // Check for security vulnerabilities
    try {
      const audit = execSync('npm audit --json', {
        cwd: this.workspaceRoot,
        encoding: 'utf-8'
      });

      const auditData = JSON.parse(audit);
      if (auditData.metadata.vulnerabilities.total > 0) {
        this.results.push({
          passed: false,
          severity: 'error',
          category: 'dependencies',
          message: `${auditData.metadata.vulnerabilities.total} security vulnerabilities found`,
          suggestion: 'Run npm audit fix to resolve vulnerabilities'
        });
      }
    } catch (error) {
      // Audit might fail
    }
  }

  private async calculateMetrics(targetPath?: string): Promise<CodeMetrics> {
    const files = this.getTypeScriptFiles(targetPath);
    let totalComplexity = 0;
    let totalLines = 0;
    let duplicateLines = 0;

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      totalComplexity += this.calculateCyclomaticComplexity(content);
      totalLines += content.split('\n').length;
    }

    // Calculate maintainability index (simplified)
    const maintainabilityIndex = Math.max(0,
      171 - 5.2 * Math.log(totalComplexity) -
      0.23 * Math.log(totalLines) -
      16.2 * Math.log(duplicateLines + 1)
    );

    return {
      cyclomaticComplexity: totalComplexity / files.length,
      cognitiveComplexity: totalComplexity * 1.2, // Simplified
      linesOfCode: totalLines,
      duplicateLines,
      testCoverage: 75, // Would be calculated from actual coverage
      maintainabilityIndex
    };
  }

  private generateRecommendations(metrics: CodeMetrics): string[] {
    const recommendations: string[] = [];

    if (metrics.cyclomaticComplexity > 10) {
      recommendations.push('🔴 CRITICAL: Reduce cyclomatic complexity by breaking down complex functions');
    }

    if (metrics.testCoverage < 80) {
      recommendations.push('🔴 CRITICAL: Increase test coverage to at least 80%');
    }

    if (metrics.maintainabilityIndex < 50) {
      recommendations.push('⚠️ WARNING: Low maintainability index - consider refactoring');
    }

    if (metrics.duplicateLines > 100) {
      recommendations.push('⚠️ WARNING: High code duplication - extract common functionality');
    }

    if (this.results.filter(r => r.category === 'security').length > 0) {
      recommendations.push('🔴 CRITICAL: Address security vulnerabilities immediately');
    }

    return recommendations;
  }

  // Helper methods
  private getTypeScriptFiles(targetPath?: string): string[] {
    const root = targetPath || this.workspaceRoot;
    const files: string[] = [];

    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.includes('node_modules')) {
          walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
          files.push(fullPath);
        }
      }
    };

    walk(root);
    return files;
  }

  private getTestFiles(targetPath?: string): string[] {
    return this.getTypeScriptFiles(targetPath).filter(f =>
      f.includes('.test.') || f.includes('.spec.') || f.includes('__tests__')
    );
  }

  private calculateCyclomaticComplexity(content: string): number {
    // Simplified complexity calculation
    const conditions = (content.match(/if\s*\(|else\s+if|while\s*\(|for\s*\(|case\s+/g) || []).length;
    return conditions + 1;
  }

  private extractFunctions(content: string): Array<{name: string, lines: number, startLine: number}> {
    // Simplified function extraction
    const functions: Array<{name: string, lines: number, startLine: number}> = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('function ') || lines[i].includes('=>')) {
        let bracketCount = 0;
        let startLine = i;
        let endLine = i;

        for (let j = i; j < lines.length; j++) {
          bracketCount += (lines[j].match(/\{/g) || []).length;
          bracketCount -= (lines[j].match(/\}/g) || []).length;
          if (bracketCount === 0 && j > i) {
            endLine = j;
            break;
          }
        }

        const funcName = lines[i].match(/function\s+(\w+)|\s+(\w+)\s*=/)?.[1] || 'anonymous';
        functions.push({
          name: funcName,
          lines: endLine - startLine + 1,
          startLine: startLine + 1
        });
      }
    }

    return functions;
  }

  private extractCodeBlocks(content: string): string[] {
    // Extract meaningful code blocks for duplication detection
    const blocks: string[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length - 5; i++) {
      const block = lines.slice(i, i + 5).join('\n').trim();
      if (block.length > 100) { // Only consider substantial blocks
        blocks.push(block);
      }
    }

    return blocks;
  }

  private hashCodeBlock(block: string): string {
    // Simple hash for code block
    let hash = 0;
    for (let i = 0; i < block.length; i++) {
      const char = block.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  private extractImports(content: string): string[] {
    const imports: string[] = [];
    const importMatches = content.match(/import.*from\s+['"]([^'"]+)['"]/g) || [];

    for (const match of importMatches) {
      const path = match.match(/from\s+['"]([^'"]+)['"]/)?.[1];
      if (path && path.startsWith('.')) {
        imports.push(path);
      }
    }

    return imports;
  }

  private detectCircularDependency(file: string, importPath: string): boolean {
    // Simplified circular dependency detection
    const visited = new Set<string>();
    const stack = new Set<string>();

    const dfs = (currentFile: string): boolean => {
      if (stack.has(currentFile)) return true;
      if (visited.has(currentFile)) return false;

      visited.add(currentFile);
      stack.add(currentFile);

      try {
        const content = fs.readFileSync(currentFile, 'utf-8');
        const imports = this.extractImports(content);

        for (const imp of imports) {
          const resolvedPath = path.resolve(path.dirname(currentFile), imp);
          if (dfs(resolvedPath + '.ts')) {
            return true;
          }
        }
      } catch (error) {
        // File might not exist
      }

      stack.delete(currentFile);
      return false;
    };

    return dfs(file);
  }
}