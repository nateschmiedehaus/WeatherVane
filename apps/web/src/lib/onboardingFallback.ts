export type OnboardingFallbackTone = "info" | "caution";

export interface OnboardingFallbackCopy {
  /** Short headline that explains why demo proof is visible. */
  title: string;
  /** Supporting guidance that clarifies the fallback situation. */
  summary: string;
  /** Recommended next step to restore live telemetry. */
  action: string;
  /** Tone used when presenting fallback state messaging. */
  tone: OnboardingFallbackTone;
  /** Maximum readiness score allowed while fallback is active. */
  scoreCap: number;
}

const FALLBACK_COPY: Record<string, OnboardingFallbackCopy> = {
  live_progress_unavailable: {
    title: "Live telemetry still syncing",
    summary: "Using demo proof until connector ingestion finishes syncing live onboarding signals.",
    action: "Finish connector setup or rerun the onboarding ingestion so live telemetry returns.",
    tone: "caution",
    scoreCap: 65,
  },
  client_error: {
    title: "Live telemetry temporarily unavailable",
    summary: "The onboarding progress API returned an error — keeping demo proof visible while we retry.",
    action: "Retry the onboarding progress call and inspect API logs to restore live telemetry.",
    tone: "caution",
    scoreCap: 60,
  },
};

const DEFAULT_FALLBACK_COPY: OnboardingFallbackCopy = {
  title: "Live telemetry offline",
  summary: "Onboarding telemetry is unavailable, so WeatherVane is showing demo proof instead.",
  action: "Reconnect onboarding services or rerun the sync to surface live signals.",
  tone: "info",
  scoreCap: 70,
};

export function describeOnboardingFallback(reason: string | null | undefined): OnboardingFallbackCopy {
  if (!reason) {
    return DEFAULT_FALLBACK_COPY;
  }
  return FALLBACK_COPY[reason] ?? DEFAULT_FALLBACK_COPY;
}

