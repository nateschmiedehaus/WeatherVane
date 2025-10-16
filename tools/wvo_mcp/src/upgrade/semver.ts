export interface Semver {
  major: number;
  minor: number;
  patch: number;
}

export type VersionConstraint =
  | { type: 'exact'; version: Semver }
  | { type: 'gte'; version: Semver };

export function parseSemver(value: string): Semver | null {
  const match = value.trim().match(/^v?(\d{1,3})(?:\.(\d{1,3}))?(?:\.(\d{1,3}))?$/);
  if (!match) {
    return null;
  }
  return {
    major: Number.parseInt(match[1] ?? '0', 10),
    minor: Number.parseInt(match[2] ?? '0', 10),
    patch: Number.parseInt(match[3] ?? '0', 10),
  };
}

export function parseVersionConstraint(raw: string): VersionConstraint | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('>=')) {
    const parsed = parseSemver(trimmed.slice(2));
    return parsed ? { type: 'gte', version: parsed } : null;
  }
  const parsed = parseSemver(trimmed);
  return parsed ? { type: 'exact', version: parsed } : null;
}

export function formatSemver(version: Semver): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

export function semverCompare(a: Semver, b: Semver): number {
  if (a.major !== b.major) {
    return a.major - b.major;
  }
  if (a.minor !== b.minor) {
    return a.minor - b.minor;
  }
  return a.patch - b.patch;
}

export function semverSatisfies(version: Semver, constraint: VersionConstraint): boolean {
  if (constraint.type === 'exact') {
    return (
      version.major === constraint.version.major &&
      version.minor === constraint.version.minor &&
      version.patch === constraint.version.patch
    );
  }
  return semverCompare(version, constraint.version) >= 0;
}
