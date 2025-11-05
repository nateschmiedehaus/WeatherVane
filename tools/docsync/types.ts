export interface DocsyncOptions {
  repoRoot: string;
  mode: 'all' | 'staged';
  dryRun: boolean;
  verbose: boolean;
}

export interface DirectoryEntry {
  path: string;
  name: string;
  absolutePath: string;
  parent: string | null;
  readmePath: string;
  hasReadme: boolean;
  files: FileEntry[];
  metrics: DirectoryMetrics;
  childDirectories: string[];
}

export interface FileEntry {
  path: string;
  absolutePath: string;
  relativeDir: string;
  name: string;
  extension: string;
  size: number;
  contentSample?: string;
  content?: string;
}

export interface DirectoryMetrics {
  languageHistogram: Record<string, number>;
  todoCount: number;
  testFileCount: number;
  criticFileCount: number;
  importTargets: Set<string>;
  downstreamConsumers: Set<string>;
  warnings: MetricWarning[];
  summary: MetricSummary;
}

export interface MetricSummary {
  coherenceScore: number;
  economyScore: number;
  localityScore: number;
  visibilityScore: number;
  evolutionScore: number;
}

export interface MetricWarning {
  severity: 'low' | 'medium' | 'high';
  force: 'coherence' | 'economy' | 'locality' | 'visibility' | 'evolution';
  message: string;
  recommendation?: string;
}

export interface ReadmeManifest {
  version: number;
  generatedAt: string;
  entries: Record<string, ManifestEntry>;
}

export interface ManifestEntry {
  digest: string;
  lastUpdated: string;
  metrics: {
    summary: MetricSummary;
    warningCount: number;
  };
}

export interface DocsyncResult {
  updated: string[];
  created: string[];
  skipped: string[];
  warnings: MetricWarningRecord[];
}

export interface MetricWarningRecord {
  directory: string;
  warnings: MetricWarning[];
}
