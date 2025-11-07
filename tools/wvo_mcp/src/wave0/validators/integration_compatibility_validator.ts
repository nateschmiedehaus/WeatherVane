/**
 * Integration & Compatibility Validator
 *
 * RIGOROUS validation of system integration, API contracts, dependency
 * compatibility, version alignment, and inter-service communication.
 * Ensures all components work together seamlessly.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawn } from 'child_process';
import * as semver from 'semver';

interface IntegrationIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  description: string;
  component: string;
  dependency?: string;
  expected: string;
  actual: string;
  impact: string;
  remediation: string;
}

interface ApiContract {
  endpoint: string;
  method: string;
  requestSchema?: any;
  responseSchema?: any;
  version: string;
  deprecated?: boolean;
}

interface ComponentInterface {
  name: string;
  version: string;
  exports: string[];
  imports: string[];
  dependencies: Map<string, string>;
  apiContracts: ApiContract[];
}

interface CompatibilityMatrix {
  component: string;
  compatible: string[];
  incompatible: string[];
  warnings: string[];
}

interface IntegrationResult {
  passed: boolean;
  issues: IntegrationIssue[];
  components: ComponentInterface[];
  compatibilityMatrix: CompatibilityMatrix[];
  integrationScore: number; // 0-100
  recommendations: string[];
}

export class IntegrationCompatibilityValidator {
  private readonly workspaceRoot: string;
  private issues: IntegrationIssue[] = [];
  private components: Map<string, ComponentInterface> = new Map();
  private apiContracts: Map<string, ApiContract[]> = new Map();

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Run RIGOROUS integration and compatibility validation
   */
  async validate(targetPath?: string): Promise<IntegrationResult> {
    console.log('🔗 Starting RIGOROUS Integration & Compatibility Validation...');
    console.log('  Analyzing component interactions and dependencies...\n');

    // Reset state
    this.issues = [];
    this.components.clear();
    this.apiContracts.clear();

    // Phase 1: Component Discovery
    console.log('  🔍 Phase 1: Component Discovery...');
    await this.discoverComponents(targetPath);

    // Phase 2: Dependency Analysis
    console.log('  📦 Phase 2: Dependency Analysis...');
    await this.analyzeDependencies();

    // Phase 3: API Contract Validation
    console.log('  📜 Phase 3: API Contract Validation...');
    await this.validateApiContracts(targetPath);

    // Phase 4: Version Compatibility Check
    console.log('  🔢 Phase 4: Version Compatibility Check...');
    await this.checkVersionCompatibility();

    // Phase 5: Inter-Service Communication Testing
    console.log('  🌐 Phase 5: Inter-Service Communication Testing...');
    await this.testInterServiceCommunication(targetPath);

    // Phase 6: Database Schema Compatibility
    console.log('  🗄️ Phase 6: Database Schema Compatibility...');
    await this.validateDatabaseCompatibility(targetPath);

    // Phase 7: Configuration Consistency
    console.log('  ⚙️ Phase 7: Configuration Consistency...');
    await this.validateConfigurationConsistency(targetPath);

    // Phase 8: Plugin/Extension Compatibility
    console.log('  🔌 Phase 8: Plugin/Extension Compatibility...');
    await this.validatePluginCompatibility(targetPath);

    // Phase 9: Protocol & Format Compatibility
    console.log('  📡 Phase 9: Protocol & Format Compatibility...');
    await this.validateProtocolCompatibility(targetPath);

    // Phase 10: End-to-End Integration Testing
    console.log('  🔄 Phase 10: End-to-End Integration Testing...');
    await this.runEndToEndIntegrationTests(targetPath);

    // Build compatibility matrix
    const compatibilityMatrix = this.buildCompatibilityMatrix();

    // Calculate integration score
    const integrationScore = this.calculateIntegrationScore();

    // Generate recommendations
    const recommendations = this.generateIntegrationRecommendations();

    // Determine pass/fail
    const criticalIssues = this.issues.filter(i => i.severity === 'critical');
    const passed = criticalIssues.length === 0 && integrationScore >= 70;

    return {
      passed,
      issues: this.issues,
      components: Array.from(this.components.values()),
      compatibilityMatrix,
      integrationScore,
      recommendations
    };
  }

  private async discoverComponents(targetPath?: string): Promise<void> {
    // Discover all components in the system
    const packageJsonPath = path.join(this.workspaceRoot, 'package.json');

    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      // Main component
      const mainComponent: ComponentInterface = {
        name: packageJson.name,
        version: packageJson.version,
        exports: [],
        imports: [],
        dependencies: new Map(Object.entries(packageJson.dependencies || {})),
        apiContracts: []
      };

      this.components.set(packageJson.name, mainComponent);

      // Discover exports
      if (packageJson.main || packageJson.exports) {
        const mainFile = packageJson.main || packageJson.exports?.['.'];
        if (mainFile) {
          const exports = await this.extractExports(path.join(this.workspaceRoot, mainFile));
          mainComponent.exports = exports;
        }
      }
    }

    // Discover microservices
    const servicesDir = path.join(this.workspaceRoot, 'services');
    if (fs.existsSync(servicesDir)) {
      const services = fs.readdirSync(servicesDir, { withFileTypes: true })
        .filter(d => d.isDirectory());

      for (const service of services) {
        const servicePackagePath = path.join(servicesDir, service.name, 'package.json');
        if (fs.existsSync(servicePackagePath)) {
          const servicePackage = JSON.parse(fs.readFileSync(servicePackagePath, 'utf-8'));

          const component: ComponentInterface = {
            name: servicePackage.name,
            version: servicePackage.version,
            exports: [],
            imports: [],
            dependencies: new Map(Object.entries(servicePackage.dependencies || {})),
            apiContracts: []
          };

          this.components.set(servicePackage.name, component);
        }
      }
    }

    // Discover sub-packages (monorepo)
    const packagesDir = path.join(this.workspaceRoot, 'packages');
    if (fs.existsSync(packagesDir)) {
      const packages = fs.readdirSync(packagesDir, { withFileTypes: true })
        .filter(d => d.isDirectory());

      for (const pkg of packages) {
        const pkgPackagePath = path.join(packagesDir, pkg.name, 'package.json');
        if (fs.existsSync(pkgPackagePath)) {
          const pkgPackage = JSON.parse(fs.readFileSync(pkgPackagePath, 'utf-8'));

          const component: ComponentInterface = {
            name: pkgPackage.name,
            version: pkgPackage.version,
            exports: [],
            imports: [],
            dependencies: new Map(Object.entries(pkgPackage.dependencies || {})),
            apiContracts: []
          };

          this.components.set(pkgPackage.name, component);
        }
      }
    }

    // Check for orphaned components
    if (this.components.size === 0) {
      this.issues.push({
        severity: 'high',
        type: 'no_components',
        description: 'No components discovered',
        component: 'system',
        expected: 'At least one component',
        actual: '0 components',
        impact: 'Cannot validate integration',
        remediation: 'Ensure package.json exists and is properly configured'
      });
    }
  }

  private async analyzeDependencies(): Promise<void> {
    // Check for dependency conflicts
    const allDependencies = new Map<string, Set<string>>();

    for (const component of this.components.values()) {
      for (const [dep, version] of component.dependencies) {
        if (!allDependencies.has(dep)) {
          allDependencies.set(dep, new Set());
        }
        allDependencies.get(dep)!.add(version);
      }
    }

    // Find version conflicts
    for (const [dep, versions] of allDependencies) {
      if (versions.size > 1) {
        const versionArray = Array.from(versions);

        // Check if versions are compatible
        let compatible = true;
        for (let i = 0; i < versionArray.length - 1; i++) {
          for (let j = i + 1; j < versionArray.length; j++) {
            if (!this.areVersionsCompatible(versionArray[i], versionArray[j])) {
              compatible = false;
              break;
            }
          }
        }

        if (!compatible) {
          this.issues.push({
            severity: 'high',
            type: 'dependency_conflict',
            description: `Conflicting versions of ${dep}`,
            component: 'multiple',
            dependency: dep,
            expected: 'Single compatible version',
            actual: versionArray.join(', '),
            impact: 'Runtime errors or unexpected behavior',
            remediation: 'Align dependency versions across components'
          });
        }
      }
    }

    // Check for circular dependencies
    for (const component of this.components.values()) {
      const visited = new Set<string>();
      const stack = new Set<string>();

      if (this.hasCircularDependency(component.name, visited, stack)) {
        this.issues.push({
          severity: 'critical',
          type: 'circular_dependency',
          description: 'Circular dependency detected',
          component: component.name,
          expected: 'Acyclic dependency graph',
          actual: 'Circular reference',
          impact: 'Build failures and runtime errors',
          remediation: 'Refactor to remove circular dependencies'
        });
      }
    }

    // Check for missing peer dependencies
    for (const component of this.components.values()) {
      const packageJsonPath = this.findPackageJson(component.name);
      if (packageJsonPath) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const peerDeps = packageJson.peerDependencies || {};

        for (const [peerDep, version] of Object.entries(peerDeps)) {
          if (!component.dependencies.has(peerDep)) {
            this.issues.push({
              severity: 'high',
              type: 'missing_peer_dependency',
              description: `Missing peer dependency: ${peerDep}`,
              component: component.name,
              dependency: peerDep,
              expected: version as string,
              actual: 'not installed',
              impact: 'Runtime errors',
              remediation: `Install ${peerDep}@${version}`
            });
          }
        }
      }
    }
  }

  private async validateApiContracts(targetPath?: string): Promise<void> {
    // Discover API contracts from OpenAPI specs, GraphQL schemas, etc.
    const specsDir = path.join(this.workspaceRoot, 'specs');
    const apisDir = path.join(this.workspaceRoot, 'apis');

    // Check OpenAPI specifications
    const openApiFiles = this.findFiles(targetPath, /openapi\.(json|yaml|yml)$/);
    for (const specFile of openApiFiles) {
      try {
        const spec = this.loadSpec(specFile);
        const contracts = this.extractApiContracts(spec);

        // Validate each contract
        for (const contract of contracts) {
          // Check for breaking changes
          const previousVersion = this.getPreviousApiVersion(contract.endpoint);
          if (previousVersion && !this.isBackwardCompatible(previousVersion, contract)) {
            this.issues.push({
              severity: 'critical',
              type: 'breaking_api_change',
              description: `Breaking change in API: ${contract.endpoint}`,
              component: 'api',
              expected: 'Backward compatible',
              actual: 'Breaking change detected',
              impact: 'Client applications will fail',
              remediation: 'Version the API or maintain backward compatibility'
            });
          }

          // Check for missing documentation
          if (!contract.requestSchema || !contract.responseSchema) {
            this.issues.push({
              severity: 'medium',
              type: 'incomplete_api_contract',
              description: `Incomplete API contract for ${contract.endpoint}`,
              component: 'api',
              expected: 'Full request/response schemas',
              actual: 'Missing schemas',
              impact: 'Integration difficulties',
              remediation: 'Complete API documentation'
            });
          }
        }

        this.apiContracts.set(specFile, contracts);
      } catch (error) {
        this.issues.push({
          severity: 'high',
          type: 'invalid_api_spec',
          description: 'Invalid API specification',
          component: path.basename(specFile),
          expected: 'Valid OpenAPI spec',
          actual: 'Parse error',
          impact: 'Cannot validate API contracts',
          remediation: 'Fix API specification syntax'
        });
      }
    }

    // Check GraphQL schemas
    const graphqlFiles = this.findFiles(targetPath, /\.(graphql|gql)$/);
    for (const schemaFile of graphqlFiles) {
      const schema = fs.readFileSync(schemaFile, 'utf-8');

      // Basic GraphQL validation
      if (!schema.includes('type Query') && !schema.includes('type Mutation')) {
        this.issues.push({
          severity: 'high',
          type: 'invalid_graphql_schema',
          description: 'GraphQL schema missing Query or Mutation type',
          component: path.basename(schemaFile),
          expected: 'Query or Mutation type',
          actual: 'Missing root types',
          impact: 'GraphQL endpoint non-functional',
          remediation: 'Add Query or Mutation type to schema'
        });
      }

      // Check for nullable fields that should be non-null
      if (/id:\s*String(?!\!)/.test(schema)) {
        this.issues.push({
          severity: 'medium',
          type: 'nullable_id_field',
          description: 'ID field is nullable in GraphQL schema',
          component: path.basename(schemaFile),
          expected: 'Non-nullable ID',
          actual: 'Nullable ID',
          impact: 'Potential null reference errors',
          remediation: 'Make ID fields non-nullable (String!)'
        });
      }
    }

    // Validate REST vs GraphQL consistency
    if (openApiFiles.length > 0 && graphqlFiles.length > 0) {
      this.issues.push({
        severity: 'low',
        type: 'mixed_api_paradigms',
        description: 'Both REST and GraphQL APIs detected',
        component: 'api',
        expected: 'Single API paradigm',
        actual: 'Mixed paradigms',
        impact: 'Increased complexity',
        remediation: 'Consider consolidating to single API paradigm'
      });
    }
  }

  private async checkVersionCompatibility(): Promise<void> {
    // Check Node.js version compatibility
    const packageJsonPath = path.join(this.workspaceRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      if (packageJson.engines?.node) {
        const requiredNode = packageJson.engines.node;
        const currentNode = process.version;

        if (!semver.satisfies(currentNode, requiredNode)) {
          this.issues.push({
            severity: 'critical',
            type: 'node_version_mismatch',
            description: 'Node.js version incompatible',
            component: 'runtime',
            expected: requiredNode,
            actual: currentNode,
            impact: 'Application may not run correctly',
            remediation: `Install Node.js version ${requiredNode}`
          });
        }
      }

      // Check npm version
      if (packageJson.engines?.npm) {
        try {
          const npmVersion = execSync('npm --version', { encoding: 'utf-8' }).trim();
          if (!semver.satisfies(npmVersion, packageJson.engines.npm)) {
            this.issues.push({
              severity: 'medium',
              type: 'npm_version_mismatch',
              description: 'npm version incompatible',
              component: 'build',
              expected: packageJson.engines.npm,
              actual: npmVersion,
              impact: 'Build issues possible',
              remediation: `Update npm to version ${packageJson.engines.npm}`
            });
          }
        } catch (error) {
          // npm not available
        }
      }
    }

    // Check TypeScript version compatibility
    const tsConfigPath = path.join(this.workspaceRoot, 'tsconfig.json');
    if (fs.existsSync(tsConfigPath)) {
      const tsConfig = JSON.parse(fs.readFileSync(tsConfigPath, 'utf-8'));
      const target = tsConfig.compilerOptions?.target;

      if (target) {
        const nodeVersion = process.version;
        const targetMap: Record<string, string> = {
          'ES2015': '6.0.0',
          'ES2017': '8.0.0',
          'ES2018': '10.0.0',
          'ES2019': '12.0.0',
          'ES2020': '14.0.0',
          'ES2021': '16.0.0',
          'ES2022': '18.0.0'
        };

        const minNode = targetMap[target.toUpperCase()];
        if (minNode && !semver.gte(nodeVersion, minNode)) {
          this.issues.push({
            severity: 'high',
            type: 'typescript_target_incompatible',
            description: `TypeScript target ${target} incompatible with Node.js version`,
            component: 'compiler',
            expected: `Node.js >= ${minNode}`,
            actual: nodeVersion,
            impact: 'Runtime errors from unsupported features',
            remediation: `Lower TypeScript target or upgrade Node.js`
          });
        }
      }
    }

    // Check framework version compatibility
    for (const component of this.components.values()) {
      // React version compatibility
      if (component.dependencies.has('react')) {
        const reactVersion = component.dependencies.get('react')!;
        const reactDomVersion = component.dependencies.get('react-dom');

        if (reactDomVersion && reactVersion !== reactDomVersion) {
          this.issues.push({
            severity: 'high',
            type: 'react_version_mismatch',
            description: 'React and ReactDOM version mismatch',
            component: component.name,
            expected: `Matching versions`,
            actual: `react@${reactVersion}, react-dom@${reactDomVersion}`,
            impact: 'Runtime errors',
            remediation: 'Align React and ReactDOM versions'
          });
        }
      }

      // Angular version compatibility
      if (component.dependencies.has('@angular/core')) {
        const angularDeps = Array.from(component.dependencies.keys())
          .filter(dep => dep.startsWith('@angular/'));

        const versions = new Set(angularDeps.map(dep => component.dependencies.get(dep)));
        if (versions.size > 1) {
          this.issues.push({
            severity: 'high',
            type: 'angular_version_mismatch',
            description: 'Angular packages version mismatch',
            component: component.name,
            expected: 'All Angular packages same version',
            actual: `${versions.size} different versions`,
            impact: 'Build and runtime errors',
            remediation: 'Align all Angular package versions'
          });
        }
      }
    }
  }

  private async testInterServiceCommunication(targetPath?: string): Promise<void> {
    // Test service discovery
    const servicesConfig = path.join(this.workspaceRoot, 'services.json');
    if (fs.existsSync(servicesConfig)) {
      const services = JSON.parse(fs.readFileSync(servicesConfig, 'utf-8'));

      for (const service of services) {
        // Test connectivity
        if (service.healthCheck) {
          try {
            const health = await this.checkServiceHealth(service.healthCheck);
            if (!health) {
              this.issues.push({
                severity: 'critical',
                type: 'service_unavailable',
                description: `Service ${service.name} is not responding`,
                component: service.name,
                expected: 'Service available',
                actual: 'Service down',
                impact: 'System functionality degraded',
                remediation: `Start service ${service.name}`
              });
            }
          } catch (error) {
            this.issues.push({
              severity: 'high',
              type: 'service_unreachable',
              description: `Cannot reach service ${service.name}`,
              component: service.name,
              expected: 'Service reachable',
              actual: 'Connection failed',
              impact: 'Inter-service communication broken',
              remediation: 'Check network configuration'
            });
          }
        }
      }
    }

    // Test message queue connectivity
    const mqConfig = this.findConfigFile('rabbitmq', 'kafka', 'redis');
    if (mqConfig) {
      const config = JSON.parse(fs.readFileSync(mqConfig, 'utf-8'));

      // Check for missing queue configuration
      if (!config.host || !config.port) {
        this.issues.push({
          severity: 'high',
          type: 'missing_mq_config',
          description: 'Message queue configuration incomplete',
          component: 'message-queue',
          expected: 'Complete configuration',
          actual: 'Missing host or port',
          impact: 'Async communication broken',
          remediation: 'Complete message queue configuration'
        });
      }
    }

    // Test gRPC services
    const protoFiles = this.findFiles(targetPath, /\.proto$/);
    for (const protoFile of protoFiles) {
      const proto = fs.readFileSync(protoFile, 'utf-8');

      // Check for service definitions
      if (!proto.includes('service ')) {
        this.issues.push({
          severity: 'medium',
          type: 'proto_no_service',
          description: 'Proto file without service definition',
          component: path.basename(protoFile),
          expected: 'Service definition',
          actual: 'No service found',
          impact: 'gRPC endpoint non-functional',
          remediation: 'Add service definition to proto file'
        });
      }

      // Check for backward compatibility
      if (proto.includes('// deprecated')) {
        this.issues.push({
          severity: 'low',
          type: 'deprecated_proto_field',
          description: 'Deprecated fields in proto file',
          component: path.basename(protoFile),
          expected: 'No deprecated fields',
          actual: 'Contains deprecated fields',
          impact: 'Future compatibility issues',
          remediation: 'Plan migration from deprecated fields'
        });
      }
    }
  }

  private async validateDatabaseCompatibility(targetPath?: string): Promise<void> {
    // Check database migrations
    const migrationsDir = path.join(this.workspaceRoot, 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const migrations = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql') || f.endsWith('.js'))
        .sort();

      // Check for migration gaps
      for (let i = 1; i < migrations.length; i++) {
        const prevNum = parseInt(migrations[i - 1].match(/^\d+/)?.[0] || '0');
        const currNum = parseInt(migrations[i].match(/^\d+/)?.[0] || '0');

        if (currNum !== prevNum + 1) {
          this.issues.push({
            severity: 'high',
            type: 'migration_gap',
            description: `Gap in migration sequence between ${prevNum} and ${currNum}`,
            component: 'database',
            expected: 'Sequential migrations',
            actual: 'Gap detected',
            impact: 'Migration failure',
            remediation: 'Fix migration numbering'
          });
        }
      }

      // Check for down migrations
      const hasDownMigrations = migrations.some(m =>
        fs.readFileSync(path.join(migrationsDir, m), 'utf-8').includes('DOWN')
      );

      if (!hasDownMigrations) {
        this.issues.push({
          severity: 'medium',
          type: 'no_rollback_migrations',
          description: 'No rollback migrations found',
          component: 'database',
          expected: 'Rollback capability',
          actual: 'No DOWN migrations',
          impact: 'Cannot rollback database changes',
          remediation: 'Add DOWN migrations for rollback'
        });
      }
    }

    // Check ORM model sync
    const modelsDir = path.join(this.workspaceRoot, 'models');
    if (fs.existsSync(modelsDir)) {
      const models = fs.readdirSync(modelsDir)
        .filter(f => f.endsWith('.ts') || f.endsWith('.js'));

      for (const modelFile of models) {
        const content = fs.readFileSync(path.join(modelsDir, modelFile), 'utf-8');

        // Check for schema drift
        if (content.includes('@Column') || content.includes('DataTypes.')) {
          // Sequelize/TypeORM model
          if (!content.includes('@Index')) {
            this.issues.push({
              severity: 'low',
              type: 'missing_db_indexes',
              description: `No indexes defined in model ${modelFile}`,
              component: modelFile,
              expected: 'Index definitions',
              actual: 'No indexes',
              impact: 'Poor query performance',
              remediation: 'Add appropriate indexes'
            });
          }
        }
      }
    }

    // Check for multiple database connections
    const dbConfigs = this.findFiles(targetPath, /database\.(json|js|ts)$/);
    if (dbConfigs.length > 1) {
      // Check if they point to different databases
      const databases = new Set<string>();
      for (const configFile of dbConfigs) {
        try {
          const config = this.loadConfig(configFile);
          if (config.database) {
            databases.add(config.database);
          }
        } catch (error) {
          // Config load failed
        }
      }

      if (databases.size > 1) {
        this.issues.push({
          severity: 'medium',
          type: 'multiple_databases',
          description: 'Multiple database connections detected',
          component: 'database',
          expected: 'Single database',
          actual: `${databases.size} databases`,
          impact: 'Increased complexity and potential data inconsistency',
          remediation: 'Consider consolidating databases'
        });
      }
    }
  }

  private async validateConfigurationConsistency(targetPath?: string): Promise<void> {
    // Find all configuration files
    const configFiles = this.findFiles(targetPath, /config\.(json|js|ts|yaml|yml)$/);
    const envFiles = this.findFiles(targetPath, /\.env/);

    // Check for configuration conflicts
    const configValues = new Map<string, Set<any>>();

    for (const configFile of configFiles) {
      try {
        const config = this.loadConfig(configFile);
        this.extractConfigValues(config, '', configValues);
      } catch (error) {
        this.issues.push({
          severity: 'high',
          type: 'invalid_config',
          description: `Invalid configuration file: ${path.basename(configFile)}`,
          component: 'configuration',
          expected: 'Valid config',
          actual: 'Parse error',
          impact: 'Application startup failure',
          remediation: 'Fix configuration syntax'
        });
      }
    }

    // Check for conflicting values
    for (const [key, values] of configValues) {
      if (values.size > 1) {
        this.issues.push({
          severity: 'high',
          type: 'config_conflict',
          description: `Conflicting configuration for ${key}`,
          component: 'configuration',
          expected: 'Consistent value',
          actual: Array.from(values).join(', '),
          impact: 'Unpredictable behavior',
          remediation: 'Align configuration values'
        });
      }
    }

    // Check environment variable usage
    for (const envFile of envFiles) {
      const envContent = fs.readFileSync(envFile, 'utf-8');
      const envVars = envContent.match(/^[A-Z_]+=/gm) || [];

      // Check if env vars are used in code
      const sourceFiles = this.findFiles(targetPath, /\.(ts|js)$/);
      for (const envVar of envVars) {
        const varName = envVar.replace('=', '');
        let used = false;

        for (const sourceFile of sourceFiles) {
          const source = fs.readFileSync(sourceFile, 'utf-8');
          if (source.includes(`process.env.${varName}`)) {
            used = true;
            break;
          }
        }

        if (!used) {
          this.issues.push({
            severity: 'low',
            type: 'unused_env_var',
            description: `Unused environment variable: ${varName}`,
            component: path.basename(envFile),
            expected: 'All env vars used',
            actual: 'Unused variable',
            impact: 'Configuration bloat',
            remediation: 'Remove unused environment variables'
          });
        }
      }
    }

    // Check for missing required configuration
    const sourceFiles = this.findFiles(targetPath, /\.(ts|js)$/);
    for (const sourceFile of sourceFiles) {
      const source = fs.readFileSync(sourceFile, 'utf-8');
      const envAccess = source.match(/process\.env\.([A-Z_]+)/g) || [];

      for (const access of envAccess) {
        const varName = access.replace('process.env.', '');
        let defined = false;

        for (const envFile of envFiles) {
          const envContent = fs.readFileSync(envFile, 'utf-8');
          if (envContent.includes(`${varName}=`)) {
            defined = true;
            break;
          }
        }

        if (!defined && !source.includes(`${varName} ||`) && !source.includes(`?? `)) {
          this.issues.push({
            severity: 'high',
            type: 'missing_env_var',
            description: `Required environment variable not defined: ${varName}`,
            component: path.basename(sourceFile),
            expected: 'Environment variable defined',
            actual: 'Not defined',
            impact: 'Runtime error',
            remediation: `Add ${varName} to environment configuration`
          });
        }
      }
    }
  }

  private async validatePluginCompatibility(targetPath?: string): Promise<void> {
    // Check for plugin system
    const pluginsDir = path.join(this.workspaceRoot, 'plugins');
    if (fs.existsSync(pluginsDir)) {
      const plugins = fs.readdirSync(pluginsDir, { withFileTypes: true })
        .filter(d => d.isDirectory());

      for (const plugin of plugins) {
        const pluginPath = path.join(pluginsDir, plugin.name);
        const pluginPackage = path.join(pluginPath, 'package.json');

        if (fs.existsSync(pluginPackage)) {
          const pkg = JSON.parse(fs.readFileSync(pluginPackage, 'utf-8'));

          // Check plugin API version compatibility
          if (pkg.pluginApi) {
            const mainPkg = JSON.parse(
              fs.readFileSync(path.join(this.workspaceRoot, 'package.json'), 'utf-8')
            );

            if (mainPkg.pluginApi && !semver.satisfies(mainPkg.pluginApi, pkg.pluginApi)) {
              this.issues.push({
                severity: 'high',
                type: 'plugin_api_mismatch',
                description: `Plugin ${plugin.name} API version incompatible`,
                component: plugin.name,
                expected: pkg.pluginApi,
                actual: mainPkg.pluginApi,
                impact: 'Plugin may not work',
                remediation: 'Update plugin or main application'
              });
            }
          }

          // Check plugin dependencies
          if (pkg.dependencies) {
            for (const [dep, version] of Object.entries(pkg.dependencies)) {
              // Check if dependency conflicts with main app
              const mainDeps = this.components.get('main')?.dependencies;
              if (mainDeps?.has(dep)) {
                const mainVersion = mainDeps.get(dep);
                if (!this.areVersionsCompatible(version as string, mainVersion!)) {
                  this.issues.push({
                    severity: 'medium',
                    type: 'plugin_dependency_conflict',
                    description: `Plugin ${plugin.name} has conflicting dependency ${dep}`,
                    component: plugin.name,
                    dependency: dep,
                    expected: mainVersion!,
                    actual: version as string,
                    impact: 'Plugin may cause issues',
                    remediation: 'Align dependency versions'
                  });
                }
              }
            }
          }
        }
      }
    }

    // Check webpack/babel plugin compatibility
    const webpackConfig = path.join(this.workspaceRoot, 'webpack.config.js');
    if (fs.existsSync(webpackConfig)) {
      const config = fs.readFileSync(webpackConfig, 'utf-8');

      // Check for deprecated plugins
      const deprecatedPlugins = [
        'CommonsChunkPlugin',
        'UglifyJsPlugin',
        'ModuleConcatenationPlugin'
      ];

      for (const deprecated of deprecatedPlugins) {
        if (config.includes(deprecated)) {
          this.issues.push({
            severity: 'medium',
            type: 'deprecated_webpack_plugin',
            description: `Using deprecated webpack plugin: ${deprecated}`,
            component: 'webpack',
            expected: 'Modern plugin',
            actual: deprecated,
            impact: 'May break with webpack upgrade',
            remediation: 'Use modern replacement plugin'
          });
        }
      }
    }
  }

  private async validateProtocolCompatibility(targetPath?: string): Promise<void> {
    // Check for protocol version mismatches
    const sourceFiles = this.findFiles(targetPath, /\.(ts|js)$/);

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf-8');

      // WebSocket protocol versions
      if (content.includes('WebSocket')) {
        if (!content.includes('ws://') && !content.includes('wss://')) {
          this.issues.push({
            severity: 'medium',
            type: 'websocket_protocol',
            description: 'WebSocket without proper protocol',
            component: path.basename(file),
            expected: 'ws:// or wss://',
            actual: 'Missing protocol',
            impact: 'Connection may fail',
            remediation: 'Specify WebSocket protocol'
          });
        }
      }

      // HTTP/2 vs HTTP/1.1
      if (content.includes('http2')) {
        // Check if client supports HTTP/2
        if (!content.includes('allowHTTP1: true')) {
          this.issues.push({
            severity: 'low',
            type: 'http2_strict',
            description: 'HTTP/2 without HTTP/1.1 fallback',
            component: path.basename(file),
            expected: 'Fallback support',
            actual: 'No fallback',
            impact: 'May not work with older clients',
            remediation: 'Add allowHTTP1: true for compatibility'
          });
        }
      }

      // JSON vs MessagePack vs Protobuf
      const serializationFormats = [];
      if (content.includes('JSON.stringify')) serializationFormats.push('JSON');
      if (content.includes('msgpack')) serializationFormats.push('MessagePack');
      if (content.includes('protobuf')) serializationFormats.push('Protobuf');

      if (serializationFormats.length > 1) {
        this.issues.push({
          severity: 'low',
          type: 'mixed_serialization',
          description: 'Multiple serialization formats detected',
          component: path.basename(file),
          expected: 'Single format',
          actual: serializationFormats.join(', '),
          impact: 'Increased complexity',
          remediation: 'Standardize on single serialization format'
        });
      }
    }

    // Check SSL/TLS configuration
    const tlsConfig = this.findFiles(targetPath, /tls|ssl|cert/i);
    if (tlsConfig.length === 0) {
      const hasHttps = sourceFiles.some(f => {
        const content = fs.readFileSync(f, 'utf-8');
        return content.includes('https://') || content.includes('createServer');
      });

      if (hasHttps) {
        this.issues.push({
          severity: 'high',
          type: 'missing_tls_config',
          description: 'HTTPS without TLS configuration',
          component: 'security',
          expected: 'TLS certificates',
          actual: 'No certificates found',
          impact: 'Cannot establish secure connections',
          remediation: 'Configure TLS certificates'
        });
      }
    }
  }

  private async runEndToEndIntegrationTests(targetPath?: string): Promise<void> {
    // Look for integration test files
    const integrationTests = this.findFiles(targetPath, /integration\.(test|spec)\.(ts|js)$/);

    if (integrationTests.length === 0) {
      this.issues.push({
        severity: 'high',
        type: 'no_integration_tests',
        description: 'No integration tests found',
        component: 'testing',
        expected: 'Integration test suite',
        actual: 'No tests',
        impact: 'Integration issues go undetected',
        remediation: 'Add integration tests'
      });
      return;
    }

    // Run integration tests if possible
    try {
      const testCommand = fs.existsSync(path.join(this.workspaceRoot, 'jest.config.js'))
        ? 'npm run test:integration'
        : 'npm test -- --grep integration';

      const result = execSync(testCommand, {
        cwd: this.workspaceRoot,
        encoding: 'utf-8',
        timeout: 60000
      });

      // Parse test results
      if (result.includes('fail')) {
        const failCount = (result.match(/fail/gi) || []).length;
        this.issues.push({
          severity: 'critical',
          type: 'integration_test_failures',
          description: `${failCount} integration tests failing`,
          component: 'testing',
          expected: 'All tests passing',
          actual: `${failCount} failures`,
          impact: 'Integration broken',
          remediation: 'Fix failing integration tests'
        });
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Test command not found
        this.issues.push({
          severity: 'medium',
          type: 'no_test_script',
          description: 'No integration test script configured',
          component: 'testing',
          expected: 'test:integration script',
          actual: 'Script not found',
          impact: 'Cannot run integration tests',
          remediation: 'Add test:integration script to package.json'
        });
      } else if (error.status !== 0) {
        // Tests failed
        this.issues.push({
          severity: 'critical',
          type: 'integration_test_error',
          description: 'Integration tests failed to run',
          component: 'testing',
          expected: 'Tests execute',
          actual: 'Execution error',
          impact: 'Unknown integration status',
          remediation: 'Fix test execution issues'
        });
      }
    }

    // Check test coverage
    const coverageReport = path.join(this.workspaceRoot, 'coverage', 'lcov-report', 'index.html');
    if (fs.existsSync(coverageReport)) {
      const coverage = fs.readFileSync(coverageReport, 'utf-8');
      const coverageMatch = coverage.match(/(\d+\.?\d*)%/);

      if (coverageMatch) {
        const coveragePercent = parseFloat(coverageMatch[1]);
        if (coveragePercent < 70) {
          this.issues.push({
            severity: 'medium',
            type: 'low_integration_coverage',
            description: `Integration test coverage only ${coveragePercent}%`,
            component: 'testing',
            expected: '> 70% coverage',
            actual: `${coveragePercent}%`,
            impact: 'Gaps in integration testing',
            remediation: 'Increase integration test coverage'
          });
        }
      }
    }
  }

  // Helper methods
  private buildCompatibilityMatrix(): CompatibilityMatrix[] {
    const matrix: CompatibilityMatrix[] = [];

    for (const component of this.components.values()) {
      const compatible: string[] = [];
      const incompatible: string[] = [];
      const warnings: string[] = [];

      // Check compatibility with other components
      for (const other of this.components.values()) {
        if (component.name === other.name) continue;

        // Check if they can work together
        let hasConflict = false;

        // Check dependency conflicts
        for (const [dep, version] of component.dependencies) {
          if (other.dependencies.has(dep)) {
            const otherVersion = other.dependencies.get(dep)!;
            if (!this.areVersionsCompatible(version, otherVersion)) {
              hasConflict = true;
              incompatible.push(`${other.name} (${dep} version conflict)`);
              break;
            }
          }
        }

        if (!hasConflict) {
          // Check for potential issues
          if (component.name.includes('react') && other.name.includes('angular')) {
            warnings.push(`${other.name} (different framework)`);
          } else {
            compatible.push(other.name);
          }
        }
      }

      matrix.push({
        component: component.name,
        compatible,
        incompatible,
        warnings
      });
    }

    return matrix;
  }

  private calculateIntegrationScore(): number {
    let score = 100;

    // Deduct points for issues
    for (const issue of this.issues) {
      switch (issue.severity) {
        case 'critical':
          score -= 20;
          break;
        case 'high':
          score -= 10;
          break;
        case 'medium':
          score -= 5;
          break;
        case 'low':
          score -= 2;
          break;
      }
    }

    // Bonus points for good practices
    if (this.apiContracts.size > 0) score += 5; // Has API documentation
    if (this.components.size > 1) score += 5; // Modular architecture

    return Math.max(0, Math.min(100, score));
  }

  private generateIntegrationRecommendations(): string[] {
    const recommendations: string[] = [];
    const issueTypes = new Set(this.issues.map(i => i.type));

    // Critical recommendations
    if (issueTypes.has('circular_dependency')) {
      recommendations.push('🔴 CRITICAL: Resolve circular dependencies immediately');
    }

    if (issueTypes.has('breaking_api_change')) {
      recommendations.push('🔴 CRITICAL: Fix breaking API changes or version properly');
    }

    if (issueTypes.has('service_unavailable')) {
      recommendations.push('🔴 CRITICAL: Ensure all required services are running');
    }

    // High priority recommendations
    if (issueTypes.has('dependency_conflict')) {
      recommendations.push('⚠️ HIGH: Align dependency versions across components');
    }

    if (issueTypes.has('no_integration_tests')) {
      recommendations.push('⚠️ HIGH: Add comprehensive integration tests');
    }

    // General recommendations
    recommendations.push('📋 Document all API contracts with OpenAPI/GraphQL schemas');
    recommendations.push('🔄 Implement service health checks and monitoring');
    recommendations.push('📦 Use dependency management tools (npm-check, renovate)');
    recommendations.push('🧪 Maintain high integration test coverage (>70%)');
    recommendations.push('📊 Set up integration monitoring and alerting');

    return recommendations;
  }

  // Utility methods
  private areVersionsCompatible(v1: string, v2: string): boolean {
    try {
      // Handle exact versions
      if (v1 === v2) return true;

      // Clean versions (remove ^, ~, etc)
      const clean1 = v1.replace(/^[^0-9]*/, '');
      const clean2 = v2.replace(/^[^0-9]*/, '');

      // Check if either satisfies the other
      return semver.satisfies(clean1, v2) || semver.satisfies(clean2, v1);
    } catch (error) {
      // If semver parsing fails, consider incompatible
      return false;
    }
  }

  private hasCircularDependency(component: string, visited: Set<string>, stack: Set<string>): boolean {
    if (stack.has(component)) return true;
    if (visited.has(component)) return false;

    visited.add(component);
    stack.add(component);

    const comp = this.components.get(component);
    if (comp) {
      for (const dep of comp.dependencies.keys()) {
        if (this.components.has(dep)) {
          if (this.hasCircularDependency(dep, visited, stack)) {
            return true;
          }
        }
      }
    }

    stack.delete(component);
    return false;
  }

  private findFiles(targetPath: string | undefined, pattern: RegExp): string[] {
    const files: string[] = [];
    const root = targetPath || this.workspaceRoot;

    const walk = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory() && !entry.name.includes('node_modules')) {
            walk(fullPath);
          } else if (entry.isFile() && pattern.test(entry.name)) {
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

  private async extractExports(filePath: string): Promise<string[]> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const exports: string[] = [];

      // Extract named exports
      const namedExports = content.match(/export\s+(?:const|let|var|function|class)\s+(\w+)/g) || [];
      for (const match of namedExports) {
        const name = match.match(/(\w+)$/)?.[0];
        if (name) exports.push(name);
      }

      // Extract default export
      if (content.includes('export default')) {
        exports.push('default');
      }

      return exports;
    } catch (error) {
      return [];
    }
  }

  private loadSpec(filePath: string): any {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (filePath.endsWith('.json')) {
      return JSON.parse(content);
    }
    // For YAML, would need a YAML parser
    return {};
  }

  private extractApiContracts(spec: any): ApiContract[] {
    const contracts: ApiContract[] = [];

    if (spec.paths) {
      for (const [path, methods] of Object.entries(spec.paths) as any) {
        for (const [method, details] of Object.entries(methods)) {
          if (typeof details === 'object' && details !== null) {
            const apiDetails = details as any;
            contracts.push({
              endpoint: path,
              method: method.toUpperCase(),
              requestSchema: apiDetails.requestBody?.content?.['application/json']?.schema,
              responseSchema: apiDetails.responses?.['200']?.content?.['application/json']?.schema,
              version: spec.info?.version || '1.0.0',
              deprecated: apiDetails.deprecated || false
            });
          }
        }
      }
    }

    return contracts;
  }

  private getPreviousApiVersion(endpoint: string): ApiContract | undefined {
    // This would check version control or previous API specs
    // Simplified for this implementation
    return undefined;
  }

  private isBackwardCompatible(old: ApiContract, current: ApiContract): boolean {
    // Check if current version maintains backward compatibility
    // Simplified check
    return current.requestSchema === old.requestSchema &&
           current.method === old.method;
  }

  private findPackageJson(componentName: string): string | undefined {
    const possibilities = [
      path.join(this.workspaceRoot, 'package.json'),
      path.join(this.workspaceRoot, 'packages', componentName, 'package.json'),
      path.join(this.workspaceRoot, 'services', componentName, 'package.json')
    ];

    for (const p of possibilities) {
      if (fs.existsSync(p)) {
        const pkg = JSON.parse(fs.readFileSync(p, 'utf-8'));
        if (pkg.name === componentName) {
          return p;
        }
      }
    }

    return undefined;
  }

  private findConfigFile(...keywords: string[]): string | undefined {
    for (const keyword of keywords) {
      const files = this.findFiles(undefined, new RegExp(`${keyword}.*\\.(json|js|yaml|yml)$`, 'i'));
      if (files.length > 0) {
        return files[0];
      }
    }
    return undefined;
  }

  private loadConfig(filePath: string): any {
    const content = fs.readFileSync(filePath, 'utf-8');

    if (filePath.endsWith('.json')) {
      return JSON.parse(content);
    } else if (filePath.endsWith('.js') || filePath.endsWith('.ts')) {
      // Would need to properly require/import
      return {};
    }
    // For YAML, would need a YAML parser
    return {};
  }

  private extractConfigValues(obj: any, prefix: string, values: Map<string, Set<any>>): void {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        this.extractConfigValues(value, fullKey, values);
      } else {
        if (!values.has(fullKey)) {
          values.set(fullKey, new Set());
        }
        values.get(fullKey)!.add(value);
      }
    }
  }

  private async checkServiceHealth(healthUrl: string): Promise<boolean> {
    // This would make an actual HTTP request
    // Simplified for this implementation
    return true;
  }
}