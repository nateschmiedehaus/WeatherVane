import fs from 'node:fs';
import path from 'node:path';

type RawDeviceProfile = {
  profile_id: string;
  collected_at?: string;
  hostname?: string;
  architecture?: string;
  memory_total_bytes?: number | null;
  accelerators?: Array<Record<string, unknown>>;
  capabilities?: {
    has_accelerator?: boolean;
    supports_cuda?: boolean;
    supports_mps?: boolean;
    recommended_concurrency?: number;
    suggested_batch_size?: number;
  };
};

export interface DeviceProfile extends RawDeviceProfile {
  collected_at?: string;
}

export interface ResourceLimits {
  codexWorkers: number;
  heavyTaskConcurrency: number;
  recommendedConcurrency: number;
  suggestedBatchSize: number | null;
  hasAccelerator: boolean;
  profileId?: string;
}

const DEFAULT_LIMITS: ResourceLimits = {
  codexWorkers: 3,
  heavyTaskConcurrency: 1,
  recommendedConcurrency: 4,
  suggestedBatchSize: null,
  hasAccelerator: false,
};

function parsePositiveInteger(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const parsed = Number.parseInt(raw.trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

export function loadDeviceProfiles(workspaceRoot: string): DeviceProfile[] {
  const registryPath = path.join(workspaceRoot, 'state', 'device_profiles.json');
  if (!fs.existsSync(registryPath)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as Record<string, RawDeviceProfile>;
    return Object.values(parsed ?? {}).map(
      (entry) => ({ ...entry, profile_id: entry.profile_id ?? '' }) satisfies DeviceProfile,
    );
  } catch {
    return [];
  }
}

export function selectActiveDeviceProfile(profiles: DeviceProfile[]): DeviceProfile | null {
  if (!profiles.length) {
    return null;
  }
  return profiles
    .slice()
    .sort((a, b) => {
      const aTime = Date.parse(a.collected_at ?? '') || 0;
      const bTime = Date.parse(b.collected_at ?? '') || 0;
      return bTime - aTime;
    })[0];
}

export function loadActiveDeviceProfile(workspaceRoot: string): DeviceProfile | null {
  const profiles = loadDeviceProfiles(workspaceRoot);
  return selectActiveDeviceProfile(profiles);
}

function clamp(value: number, minValue: number, maxValue: number): number {
  return Math.max(minValue, Math.min(maxValue, value));
}

export function deriveResourceLimits(profile: DeviceProfile | null): ResourceLimits {
  const recommended =
    profile?.capabilities?.recommended_concurrency && profile.capabilities.recommended_concurrency > 0
      ? profile.capabilities.recommended_concurrency
      : DEFAULT_LIMITS.recommendedConcurrency;

  const suggestedBatchSize = profile?.capabilities?.suggested_batch_size ?? null;

  let codexWorkers = clamp(Math.round(recommended / 2), 2, 6);
  let heavyTaskConcurrency = clamp(Math.floor(recommended / 4), 1, 3);

  if (recommended <= 2) {
    codexWorkers = 2;
    heavyTaskConcurrency = 1;
  } else if (recommended >= 12) {
    codexWorkers = clamp(Math.round(recommended / 1.5), 4, 6);
    heavyTaskConcurrency = clamp(Math.floor(recommended / 3), 2, 3);
  }

  heavyTaskConcurrency = Math.min(heavyTaskConcurrency, codexWorkers);

  const overrideCodex = parsePositiveInteger(process.env.WVO_CODEX_WORKERS);
  if (typeof overrideCodex === 'number') {
    codexWorkers = clamp(overrideCodex, 1, 8);
  }

  const overrideHeavy = parsePositiveInteger(process.env.WVO_HEAVY_TASK_CONCURRENCY);
  if (typeof overrideHeavy === 'number') {
    heavyTaskConcurrency = clamp(overrideHeavy, 1, Math.max(1, codexWorkers));
  }

  if (heavyTaskConcurrency > codexWorkers) {
    heavyTaskConcurrency = codexWorkers;
  }

  return {
    codexWorkers,
    heavyTaskConcurrency,
    recommendedConcurrency: recommended,
    suggestedBatchSize,
    hasAccelerator: Boolean(profile?.capabilities?.has_accelerator),
    profileId: profile?.profile_id,
  };
}
