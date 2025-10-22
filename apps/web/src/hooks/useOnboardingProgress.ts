import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildAutomationAuditPreview,
  buildConnectorProgress,
  mergeEvidenceWithFallback,
  type AutomationAuditAction,
  type AutomationAuditEvidenceItem,
  type AutomationAuditNarrative,
  type AutomationAuditPreview,
  type AutomationAuditStatus,
  type ConnectorProgress,
  type ConnectorStatus,
} from "../demo/onboarding";
import { fetchOnboardingProgress, recordOnboardingEvent } from "../lib/api";
import { useDemo } from "../lib/demo";
import type {
  OnboardingAuditEvidenceResponse,
  OnboardingAuditActionResponse,
  OnboardingAuditNarrativeResponse,
  OnboardingAuditResponse,
  OnboardingConnectorResponse,
  OnboardingMode,
  OnboardingProgressResponse,
} from "../types/onboarding";

interface UseOnboardingProgressOptions {
  tenantId: string;
  mode?: OnboardingMode;
  enabled?: boolean;
}

interface OnboardingProgressResult {
  connectors: ConnectorProgress[];
  audits: AutomationAuditPreview[];
  loading: boolean;
  error: Error | null;
  mode: OnboardingMode;
  snapshot?: OnboardingProgressResponse;
  isFallback: boolean;
  fallbackReason: string | null;
}

const CONNECTOR_STATUS_MAP: Record<string, ConnectorStatus> = {
  ready: "ready",
  connected: "ready",
  in_progress: "in_progress",
  configuring: "in_progress",
  needs_action: "action_needed",
  action_needed: "action_needed",
};

const AUDIT_STATUS_MAP: Record<string, AutomationAuditStatus> = {
  approved: "approved",
  pending: "pending",
  awaiting: "pending",
  shadow: "shadow",
};

export function useOnboardingProgress(options: UseOnboardingProgressOptions): OnboardingProgressResult {
  const { tenantId, mode, enabled = true } = options;
  const { isDemoActive, preferences, onboardingProgress, setOnboardingProgress } = useDemo();

  const effectiveMode: OnboardingMode = mode ?? (isDemoActive ? "demo" : "live");
  const demoConnectors = useMemo(
    () => buildConnectorProgress(preferences),
    [preferences],
  );
  const demoAudits = useMemo(
    () => buildAutomationAuditPreview(preferences),
    [preferences],
  );

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [snapshot, setSnapshot] = useState<OnboardingProgressResponse | undefined>();
  const lastSnapshotEvent = useRef<string | null>(null);
  const lastFallbackEvent = useRef<string | null>(null);
  const lastErrorEvent = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !tenantId) {
      return;
    }

    let isMounted = true;
    const controller = new AbortController();
    const { signal } = controller;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        void recordOnboardingEvent(tenantId, "progress.requested", effectiveMode, {
          enabled,
        });
        const response = await fetchOnboardingProgress(tenantId, effectiveMode, { signal });
        if (!isMounted) {
          return;
        }
        setSnapshot(response);
        const merged = mergeProgressResponse(response, demoConnectors, demoAudits, effectiveMode);
        setOnboardingProgress({
          mode: effectiveMode,
          fallbackReason: response.fallback_reason ?? null,
          generatedAt: response.generated_at ?? null,
          isFallback: merged.isFallback,
          connectors: merged.connectors,
          audits: merged.audits,
        });

        const snapshotKey = [
          response.generated_at ?? "unknown",
          response.fallback_reason ?? "none",
          response.connectors.length,
          response.audits.length,
        ].join("|");
        if (lastSnapshotEvent.current !== snapshotKey) {
          lastSnapshotEvent.current = snapshotKey;
          void recordOnboardingEvent(tenantId, "progress.loaded", effectiveMode, {
            fallback_reason: response.fallback_reason ?? null,
            connectors: response.connectors.length,
            audits: response.audits.length,
            generated_at: response.generated_at ?? null,
          });
        }
        if (response.fallback_reason) {
          if (lastFallbackEvent.current !== response.fallback_reason) {
            lastFallbackEvent.current = response.fallback_reason;
            void recordOnboardingEvent(tenantId, "progress.fallback", effectiveMode, {
              fallback_reason: response.fallback_reason,
              connectors: response.connectors.length,
              audits: response.audits.length,
            });
          }
        } else {
          lastFallbackEvent.current = null;
        }
      } catch (caught) {
        const isAbortError =
          (caught instanceof DOMException && caught.name === "AbortError") ||
          (caught instanceof Error && caught.name === "AbortError");
        if (isAbortError) {
          return;
        }
        if (!isMounted) {
          return;
        }
        const fallbackError = caught instanceof Error ? caught : new Error("Unknown onboarding progress error");
        setError(fallbackError);
        setSnapshot(undefined);
        setOnboardingProgress({
          mode: effectiveMode,
          fallbackReason: "client_error",
          generatedAt: null,
          isFallback: true,
          connectors: demoConnectors,
          audits: demoAudits,
        });
        const errorKey = fallbackError.message ?? "unknown";
        if (lastErrorEvent.current !== errorKey) {
          lastErrorEvent.current = errorKey;
          void recordOnboardingEvent(tenantId, "progress.error", effectiveMode, {
            message: errorKey,
          });
        }
        if (lastFallbackEvent.current !== "client_error") {
          lastFallbackEvent.current = "client_error";
          void recordOnboardingEvent(tenantId, "progress.fallback", effectiveMode, {
            fallback_reason: "client_error",
            connectors: demoConnectors.length,
            audits: demoAudits.length,
          });
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [tenantId, effectiveMode, enabled, demoConnectors, demoAudits, setOnboardingProgress]);

  const activeProgress = useMemo(() => {
    if (onboardingProgress && onboardingProgress.mode === effectiveMode) {
      return onboardingProgress;
    }
    return null;
  }, [onboardingProgress, effectiveMode]);

  const result = useMemo<OnboardingProgressResult>(() => {
    if (activeProgress) {
      return {
        connectors: activeProgress.connectors,
        audits: activeProgress.audits,
        loading,
        error,
        mode: effectiveMode,
        snapshot,
        isFallback: activeProgress.isFallback,
        fallbackReason: activeProgress.fallbackReason ?? null,
      };
    }
    return {
      connectors: demoConnectors,
      audits: demoAudits,
      loading,
      error,
      mode: effectiveMode,
      snapshot,
      isFallback: true,
      fallbackReason: snapshot?.fallback_reason ?? null,
    };
  }, [activeProgress, demoConnectors, demoAudits, loading, error, effectiveMode, snapshot]);

  return result;
}

function mergeProgressResponse(
  response: OnboardingProgressResponse,
  demoConnectors: ConnectorProgress[],
  demoAudits: AutomationAuditPreview[],
  mode: OnboardingMode,
) {
  const connectorLookup = new Map<string, ConnectorProgress>();
  demoConnectors.forEach((item) => {
    connectorLookup.set(item.slug, item);
  });

  const mergedConnectors = demoConnectors.map((fallback) => {
    const record = response.connectors.find((entry) => entry.slug === fallback.slug);
    if (!record) {
      return fallback;
    }
    return mapConnectorRecord(record, fallback, mode);
  });

  const unmatchedRecords = response.connectors.filter(
    (record) => !connectorLookup.has(record.slug),
  );
  unmatchedRecords.forEach((record) => {
    mergedConnectors.push(mapConnectorRecord(record, undefined, mode));
  });

  const mergedAudits =
    response.audits.length === 0
      ? demoAudits
      : response.audits.map((record, index) =>
          mapAuditRecord(record, demoAudits[index]),
        );

  const usedServerData = response.connectors.length > 0 || response.audits.length > 0;
  const isFallback = Boolean(response.fallback_reason) || !usedServerData;

  return {
    connectors: mergedConnectors,
    audits: mergedAudits,
    isFallback,
  };
}

function mapConnectorRecord(
  record: OnboardingConnectorResponse,
  fallback: ConnectorProgress | undefined,
  mode: OnboardingMode,
): ConnectorProgress {
  const status = normaliseConnectorStatus(record.status, fallback?.status);
  const summary =
    record.summary ??
    (mode === "demo" ? fallback?.summary ?? "" : fallback?.summary ?? "");
  const action =
    mode === "demo"
      ? fallback?.action
      : record.action ?? fallback?.action;
  const progress =
    typeof record.progress === "number" ? record.progress : fallback?.progress ?? 0;
  const updatedAt = parseISOToDate(record.updated_at);
  const relative = formatRelativeFromDate(updatedAt);

  return {
    slug: record.slug,
    label: record.label || fallback?.label || record.slug,
    status,
    progress,
    summary: summary ?? "",
    action: action ?? undefined,
    timeAgo: relative?.label ?? fallback?.timeAgo ?? "Just now",
    focus: fallback?.focus,
  };
}

export function normaliseAuditEvidence(
  evidence: OnboardingAuditEvidenceResponse[] | null | undefined,
  fallback: AutomationAuditEvidenceItem[] | undefined,
): AutomationAuditEvidenceItem[] | undefined {
  const mapped: AutomationAuditEvidenceItem[] | undefined =
    evidence?.map((item, index) => {
      const fallbackItem =
        (item.id && fallback?.find((candidate) => candidate.id === item.id)) ??
        fallback?.[index];
      const label = (item.label ?? fallbackItem?.label ?? "").trim();
      const value = (item.value ?? fallbackItem?.value ?? "").trim();
      if (!label || !value) {
        return undefined;
      }
      const tone = item.tone ? item.tone.trim().toLowerCase() : undefined;
      const link =
        item.link_href && item.link_href.trim().length > 0
          ? {
              href: item.link_href,
              label: item.link_label?.trim().length
                ? item.link_label
                : fallbackItem?.link?.label ?? "View evidence",
            }
          : fallbackItem?.link;

      return {
        id: item.id ?? fallbackItem?.id ?? `evidence-${index}`,
        label,
        value,
        tone: tone === "success" || tone === "caution" || tone === "info"
          ? tone
          : fallbackItem?.tone,
        context: item.context ?? fallbackItem?.context,
        link,
      };
    }).filter((candidate): candidate is AutomationAuditEvidenceItem => Boolean(candidate));

  return mergeEvidenceWithFallback(mapped, fallback);
}

function normaliseAuditNarrative(
  narrative: OnboardingAuditNarrativeResponse | null | undefined,
  fallback: AutomationAuditNarrative | undefined,
): AutomationAuditNarrative | undefined {
  if (!narrative) {
    return fallback;
  }
  const merged: AutomationAuditNarrative = {
    why: narrative.why ?? fallback?.why,
    impact: narrative.impact ?? fallback?.impact,
    impactLabel: narrative.impact_label ?? fallback?.impactLabel,
    impactValue: narrative.impact_value ?? fallback?.impactValue,
    impactContext: narrative.impact_context ?? fallback?.impactContext,
    nextStep: narrative.next_step ?? fallback?.nextStep,
  };
  const hasValue = Object.values(merged).some((value) => Boolean(value));
  return hasValue ? merged : fallback;
}

function normaliseActionIntent(
  intent: string | null | undefined,
  fallback: AutomationAuditAction["intent"] | undefined,
): AutomationAuditAction["intent"] | undefined {
  if (intent) {
    const key = intent.trim().toLowerCase();
    if (key === "approve" || key === "rollback" || key === "view_evidence" || key === "acknowledge") {
      return key;
    }
  }
  return fallback;
}

function normaliseAuditActions(
  actions: OnboardingAuditActionResponse[] | null | undefined,
  fallback: AutomationAuditAction[] | undefined,
): AutomationAuditAction[] | undefined {
  if (!actions || actions.length === 0) {
    return fallback;
  }
  const mapped = actions
    .map((action, index) => {
      const fallbackAction = fallback?.[index];
      const label = action.label?.trim().length ? action.label : fallbackAction?.label;
      const intent = normaliseActionIntent(action.intent, fallbackAction?.intent);
      if (!label || !intent) {
        return undefined;
      }
      const id = action.id?.trim().length
        ? action.id
        : fallbackAction?.id ?? `action-${index}`;
      return {
        id,
        label,
        intent,
        href: action.href?.trim().length ? action.href : fallbackAction?.href,
        tooltip: action.tooltip ?? fallbackAction?.tooltip,
      };
    })
    .filter((candidate): candidate is AutomationAuditAction => Boolean(candidate));

  if (mapped.length === 0) {
    return fallback;
  }

  return mapped;
}

function mapAuditRecord(
  record: OnboardingAuditResponse,
  fallback: AutomationAuditPreview | undefined,
): AutomationAuditPreview {
  const occurredAt = parseISOToDate(record.occurred_at);
  const evidence = normaliseAuditEvidence(record.evidence, fallback?.evidence);
  const narrative = normaliseAuditNarrative(record.narrative, fallback?.narrative);
  const actions = normaliseAuditActions(record.actions, fallback?.actions);
  const relative = formatRelativeFromDate(occurredAt);
  return {
    id: record.id,
    actor: record.actor ?? fallback?.actor ?? "",
    headline: record.headline || fallback?.headline || "",
    detail: record.detail ?? fallback?.detail ?? "",
    status: normaliseAuditStatus(record.status, fallback?.status),
    timeAgo: relative?.label ?? fallback?.timeAgo ?? "Just now",
    minutesAgo: relative?.minutes ?? fallback?.minutesAgo,
    evidence,
    narrative,
    actions,
  };
}

function normaliseConnectorStatus(
  status: string | undefined,
  fallback: ConnectorStatus | undefined,
): ConnectorStatus {
  if (status) {
    const key = status.toLowerCase();
    const mapped = CONNECTOR_STATUS_MAP[key];
    if (mapped) {
      return mapped;
    }
  }
  return fallback ?? "in_progress";
}

function normaliseAuditStatus(
  status: string | undefined,
  fallback: AutomationAuditStatus | undefined,
): AutomationAuditStatus {
  if (status) {
    const key = status.toLowerCase();
    const mapped = AUDIT_STATUS_MAP[key];
    if (mapped) {
      return mapped;
    }
  }
  return fallback ?? "pending";
}

interface RelativeTimeLabel {
  label: string;
  minutes: number;
}

function formatRelativeFromDate(date: Date | null | undefined): RelativeTimeLabel | undefined {
  if (!date) {
    return undefined;
  }
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMinutes = Math.max(Math.round(diffMs / 60000), 0);
  if (diffMinutes < 1) {
    return {
      label: "Just now",
      minutes: diffMinutes,
    };
  }
  if (diffMinutes < 60) {
    return {
      label: `${diffMinutes}m ago`,
      minutes: diffMinutes,
    };
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return {
      label: `${diffHours}h ago`,
      minutes: diffMinutes,
    };
  }
  const diffDays = Math.round(diffHours / 24);
  return {
    label: `${diffDays}d ago`,
    minutes: diffMinutes,
  };
}

function parseISOToDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
