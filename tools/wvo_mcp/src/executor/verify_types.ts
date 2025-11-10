export type CoverageEntry = {
  statements?: number;
  hits?: number;
  percent?: number;
  covered_lines?: number[];
  missing_lines?: number[];
  coverage?: number;
};

export type NormalizedCoverage = {
  files: Record<string, CoverageEntry>;
  summary: CoverageEntry & Record<string, unknown>;
};

export type CoverageAllowlist = {
  raw: string[];
  regexes: RegExp[];
};

export type ChangedFilePartition = {
  tracked: string[];
  ignored_tests: string[];
  allowlisted: string[];
};

export type V8CoverageEntry = {
  statementMap?: Record<string, { start?: { line?: number }; end?: { line?: number } }>;
  s?: Record<string, number>;
};

export type V8CoverageSummary = {
  files: number;
  covered_lines: number;
  total_lines: number;
};

export type NormalizedV8Coverage = {
  files: Record<
    string,
    {
      covered_lines: number[];
      missing_lines: number[];
      coverage: number;
    }
  >;
  summary: V8CoverageSummary;
};
