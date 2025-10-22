import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

import { AutomationAuditList } from "../components/AutomationAuditList";
import { AutomationAuditTimeline } from "../components/AutomationAuditTimeline";
import { AutomationReadinessCard } from "../components/AutomationReadinessCard";
import { GuardrailBreachPanel } from "../components/GuardrailBreachPanel";
import styles from "../styles/automations.module.css";
import { Layout } from "../components/Layout";
import { ContextPanel } from "../components/ContextPanel";
import { RetryButton } from "../components/RetryButton";
import {
  fetchAutomationSettings,
  fetchDashboard,
  fetchAuditLogs,
  updateAutomationSettings,
} from "../lib/api";
import { useDemo } from "../lib/demo";
import { useOnboardingProgress } from "../hooks/useOnboardingProgress";
import { mapAutomationAuditLogs } from "../lib/automationInsights";
import {
  buildAutomationUpdatePayload,
  validateAutomationSettings,
  type AutomationValidationErrors,
  type AutomationValidationField,
} from "../lib/automationValidation";
import { buildAutomationReadinessSnapshot } from "../lib/automationReadiness";
import { describeOnboardingFallback } from "../lib/onboardingFallback";
import { buildGuardrailNarratives } from "../lib/guardrailCopy";
import type {
  AutomationMode,
  AutomationSettings,
  AutomationSettingsResponse,
  ConsentStatus,
} from "../types/automation";
import type { GuardrailSegment } from "../types/dashboard";
import type { AutomationAuditTimelineItem } from "../lib/automationInsights";
import { useTheme } from "../lib/theme";
import { getSurfaceTokens } from "../../styles/themes";

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-tenant";
const UPDATED_BY = process.env.NEXT_PUBLIC_OPERATOR_EMAIL ?? "ops@weathervane";

const automationModes: { value: AutomationMode; label: string; description: string }[] = [
  { value: "manual", label: "Manual", description: "Read-only plan & proof" },
  { value: "assist", label: "Assist", description: "Require approvals before pushes" },
  { value: "automation", label: "Automation", description: "Auto-push within guardrails" },
];

const consentStatuses: { value: ConsentStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "granted", label: "Granted" },
  { value: "revoked", label: "Revoked" },
];

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export default function AutomationsPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const surfaceTokens = useMemo(() => getSurfaceTokens(theme, "automations"), [theme]);
  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [responseMeta, setResponseMeta] = useState<AutomationSettingsResponse | null>(null);
  const [validationErrors, setValidationErrors] = useState<AutomationValidationErrors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [auditTimeline, setAuditTimeline] = useState<AutomationAuditTimelineItem[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [guardrailSegments, setGuardrailSegments] = useState<GuardrailSegment[]>([]);
  const [guardrailGeneratedAt, setGuardrailGeneratedAt] = useState<string | null>(null);
  const [guardrailLoading, setGuardrailLoading] = useState(true);
  const [guardrailError, setGuardrailError] = useState<string | null>(null);
  const { isDemoActive } = useDemo();
  const onboarding = useOnboardingProgress({
    tenantId: TENANT_ID,
    mode: isDemoActive ? "demo" : "live",
  });
  const onboardingAudits = onboarding.audits;
  const onboardingErrorMessage = onboarding.error?.message ?? null;
  const fallbackReason = onboarding.fallbackReason ?? onboarding.snapshot?.fallback_reason ?? null;
  const fallbackDetails = onboarding.isFallback ? describeOnboardingFallback(fallbackReason) : null;
  const guardrailMetadata = responseMeta?.data_context ?? undefined;

  const loadSettings = useCallback(() => {
    let active = true;
    setLoading(true);
    fetchAutomationSettings(TENANT_ID)
      .then((res) => {
        if (!active) return;
        setSettings(res.settings);
        setResponseMeta(res);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message ?? "Failed to load automation settings");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const cancel = loadSettings();
    return cancel;
  }, [loadSettings, reloadCount]);

  useEffect(() => {
    if (!settings) {
      setValidationErrors({});
      return;
    }
    const { errors } = validateAutomationSettings(settings);
    setValidationErrors(errors);
  }, [settings]);

  const handleRetry = () => setReloadCount((value) => value + 1);

  const changeWindowsText = useMemo(
    () => settings?.guardrails.change_windows.join(", ") ?? "",
    [settings?.guardrails.change_windows],
  );

  const contextTags = responseMeta?.context_tags ?? [];
  const contextWarnings = responseMeta?.context_warnings ?? [];
  const guardrailNarratives = useMemo(
    () =>
      settings
        ? buildGuardrailNarratives(settings.guardrails, {
            metadata: guardrailMetadata,
          })
        : [],
    [settings, guardrailMetadata],
  );

  const fallbackAuditTimeline = useMemo<AutomationAuditTimelineItem[]>(
    () =>
      onboardingAudits.map((audit, index) => ({
        id: audit.id ? String(audit.id) : `fallback-${index}`,
        headline: audit.headline,
        detail: audit.detail ?? undefined,
        actor: audit.actor ?? "WeatherVane",
        occurredAt: new Date().toISOString(),
        timeAgo: audit.timeAgo,
        tone: audit.status === "approved" ? "success" : audit.status === "pending" ? "caution" : "info",
      })),
    [onboardingAudits],
  );

  const readinessSnapshot = useMemo(
    () =>
      buildAutomationReadinessSnapshot(onboardingAudits, guardrailSegments, {
        guardrailGeneratedAt,
        isFallback: onboarding.isFallback,
        fallbackReason,
      }),
    [onboardingAudits, guardrailSegments, guardrailGeneratedAt, onboarding.isFallback, fallbackReason],
  );
  const readinessLoading = onboarding.loading || auditLoading || guardrailLoading;

  useEffect(() => {
    let active = true;
    setAuditLoading(true);
    setAuditError(null);
    fetchAuditLogs(TENANT_ID, 40)
      .then((res) => {
        if (!active) return;
        if (res.logs.length === 0) {
          setAuditTimeline(fallbackAuditTimeline);
          setAuditError(onboardingErrorMessage ?? "No automation changes recorded yet.");
          return;
        }
        setAuditTimeline(mapAutomationAuditLogs(res.logs));
      })
      .catch((err) => {
        if (!active) return;
        setAuditTimeline(fallbackAuditTimeline);
        const message = err instanceof Error ? err.message : "Failed to load audit history";
        setAuditError(message);
      })
      .finally(() => {
        if (!active) return;
        setAuditLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadCount, fallbackAuditTimeline, onboardingErrorMessage]);

  useEffect(() => {
    let active = true;
    setGuardrailLoading(true);
    setGuardrailError(null);
    fetchDashboard(TENANT_ID)
      .then((res) => {
        if (!active) return;
        setGuardrailSegments(res.guardrails);
        setGuardrailGeneratedAt(res.generated_at ?? null);
      })
      .catch((err) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Failed to load guardrail posture";
        setGuardrailError(message);
        setGuardrailSegments([]);
      })
      .finally(() => {
        if (!active) return;
        setGuardrailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadCount]);

  const handleModeChange = (mode: AutomationMode) => {
    setSettings((prev) => (prev ? { ...prev, mode } : prev));
  };

  const handleConsentChange = (status: ConsentStatus) => {
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            consent: {
              ...prev.consent,
              status,
              granted_at:
                status === "granted"
                  ? prev.consent.granted_at ?? new Date().toISOString()
                  : null,
              revoked_at:
                status === "revoked"
                  ? prev.consent.revoked_at ?? new Date().toISOString()
                  : null,
            },
          }
        : prev,
    );
  };

  const handleGuardrailChange = (field: keyof AutomationSettings["guardrails"], value: string) => {
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            guardrails: {
              ...prev.guardrails,
              [field]: field === "change_windows"
                ? value
                    .split(",")
                    .map((entry) => entry.trim())
                    .filter(Boolean)
                : field === "max_daily_budget_delta_pct" || field === "min_daily_spend"
                ? Number(value)
                : value === ""
                ? null
                : Number(value),
            },
          }
        : prev,
    );
  };

  const handleInputChange = (
    field: keyof AutomationSettings,
    value: string | number | boolean | null,
  ) => {
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            [field]: value,
          }
        : prev,
    );
  };

  const handleOpenDashboard = useCallback(() => {
    void router.push("/dashboard");
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settings) return;
    setSaving(true);
    setStatusMessage(null);
    setError(null);

    const { payload, validation } = buildAutomationUpdatePayload(settings, UPDATED_BY);
    setValidationErrors(validation.errors);

    if (!validation.isValid) {
      setSaving(false);
      setError("Resolve the highlighted guardrail issues before saving.");
      return;
    }

    try {
      const res = await updateAutomationSettings(TENANT_ID, payload);
      setSettings(res.settings);
      setResponseMeta(res);
      setStatusMessage("Automation settings updated");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message ?? "Failed to update settings");
    } finally {
      setSaving(false);
    }
  };

  const fieldError = (field: AutomationValidationField) => validationErrors[field];
  const fieldErrorId = (field: AutomationValidationField) =>
    fieldError(field) ? `${field.replace(/\./g, "-")}-error` : undefined;

  return (
    <Layout>
      <Head>
        <title>WeatherVane · Automations</title>
      </Head>
      <div className={styles.root} style={surfaceTokens}>
        <section className={styles.header}>
          <h2 className="ds-title">Guided automation you can trust</h2>
          <p className="ds-body">
            Control how WeatherVane pushes budgets, maintain tenant consent, and keep your safety bands
            aligned with finance. Every change is logged in plain language with evidence and next steps.
          </p>
        </section>

      {loading && (
        <p className={`${styles.status} ds-body`} role="status" aria-live="polite">
          Loading automation settings…
        </p>
      )}
      {error && (
        <div className={styles.error} role="alert">
          <p className="ds-body">{error}</p>
          <RetryButton onClick={handleRetry}>Retry loading settings</RetryButton>
        </div>
      )}
      {statusMessage && (
        <p className={`${styles.success} ds-body`} role="status" aria-live="polite">
          {statusMessage}
        </p>
      )}

      {!settings && (
        <section className={styles.changeLogFallback} aria-label="Automation change log preview">
          <AutomationAuditList
            audits={onboardingAudits}
            loading={onboarding.loading}
            isFallback={onboarding.isFallback}
            errorMessage={fallbackDetails ? fallbackDetails.summary : onboardingErrorMessage}
            metaLabel={fallbackDetails?.title ?? undefined}
            limit={5}
            className={styles.auditRail}
          />
        </section>
      )}

      {!loading && settings && (
        <>
          <div className={styles.layout}>
            <form className={styles.form} onSubmit={handleSubmit}>
            <fieldset className={styles.fieldset}>
              <legend className="ds-caption">Automation mode</legend>
              <div className={styles.modeList}>
                {automationModes.map((mode) => (
                  <label key={mode.value} className={styles.modeItem}>
                    <input
                      type="radio"
                      name="mode"
                      value={mode.value}
                      checked={settings.mode === mode.value}
                      onChange={() => handleModeChange(mode.value)}
                    />
                    <div>
                      <strong className="ds-body-strong">{mode.label}</strong>
                      <p className="ds-caption">{mode.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className={styles.fieldset}>
              <legend className="ds-caption">Push guardrails</legend>
              <div className={styles.gridRow}>
                <label>
                  <span className="ds-caption">Daily push cap</span>
                  <input
                    type="number"
                    min={0}
                    value={settings.daily_push_cap}
                    onChange={(event) =>
                      handleInputChange("daily_push_cap", Number(event.target.value))
                    }
                    className={fieldError("daily_push_cap") ? styles.inputInvalid : undefined}
                    aria-invalid={fieldError("daily_push_cap") ? true : false}
                    aria-describedby={fieldErrorId("daily_push_cap")}
                  />
                  {fieldError("daily_push_cap") && (
                    <span
                      className={`${styles.fieldError} ds-caption`}
                      id={fieldErrorId("daily_push_cap")}
                    >
                      {fieldError("daily_push_cap")}
                    </span>
                  )}
                </label>
                <label>
                  <span className="ds-caption">Push window start (UTC)</span>
                  <input
                    type="time"
                    value={settings.push_window_start_utc ?? ""}
                    onChange={(event) =>
                      handleInputChange("push_window_start_utc", event.target.value || null)
                    }
                    className={fieldError("push_window_start_utc") ? styles.inputInvalid : undefined}
                    aria-invalid={fieldError("push_window_start_utc") ? true : false}
                    aria-describedby={fieldErrorId("push_window_start_utc")}
                  />
                  {fieldError("push_window_start_utc") && (
                    <span
                      className={`${styles.fieldError} ds-caption`}
                      id={fieldErrorId("push_window_start_utc")}
                    >
                      {fieldError("push_window_start_utc")}
                    </span>
                  )}
                </label>
                <label>
                  <span className="ds-caption">Push window end (UTC)</span>
                  <input
                    type="time"
                    value={settings.push_window_end_utc ?? ""}
                    onChange={(event) =>
                      handleInputChange("push_window_end_utc", event.target.value || null)
                    }
                    className={fieldError("push_window_end_utc") ? styles.inputInvalid : undefined}
                    aria-invalid={fieldError("push_window_end_utc") ? true : false}
                    aria-describedby={fieldErrorId("push_window_end_utc")}
                  />
                  {fieldError("push_window_end_utc") && (
                    <span
                      className={`${styles.fieldError} ds-caption`}
                      id={fieldErrorId("push_window_end_utc")}
                    >
                      {fieldError("push_window_end_utc")}
                    </span>
                  )}
                </label>
              </div>

              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={settings.pushes_enabled}
                  onChange={(event) => handleInputChange("pushes_enabled", event.target.checked)}
                />
                <span className="ds-body">Enable automated pushes within guardrails</span>
              </label>

              <label>
                <span className="ds-caption">Change windows (comma separated)</span>
                <input
                  type="text"
                  value={changeWindowsText}
                  onChange={(event) => handleGuardrailChange("change_windows", event.target.value)}
                  placeholder="e.g. weekdays, black_friday"
                  className={
                    fieldError("guardrails.change_windows") ? styles.inputInvalid : undefined
                  }
                  aria-invalid={fieldError("guardrails.change_windows") ? true : false}
                  aria-describedby={fieldErrorId("guardrails.change_windows")}
                />
                {fieldError("guardrails.change_windows") && (
                  <span
                    className={`${styles.fieldError} ds-caption`}
                    id={fieldErrorId("guardrails.change_windows")}
                  >
                    {fieldError("guardrails.change_windows")}
                  </span>
                )}
              </label>

              <div className={styles.gridRow}>
                <label>
                  <span className="ds-caption">Max daily delta %</span>
                  <input
                    type="number"
                    min={0}
                    value={settings.guardrails.max_daily_budget_delta_pct}
                    onChange={(event) =>
                      handleGuardrailChange("max_daily_budget_delta_pct", event.target.value)
                    }
                    className={
                      fieldError("guardrails.max_daily_budget_delta_pct")
                        ? styles.inputInvalid
                        : undefined
                    }
                    aria-invalid={fieldError("guardrails.max_daily_budget_delta_pct") ? true : false}
                    aria-describedby={fieldErrorId("guardrails.max_daily_budget_delta_pct")}
                  />
                  {fieldError("guardrails.max_daily_budget_delta_pct") && (
                    <span
                      className={`${styles.fieldError} ds-caption`}
                      id={fieldErrorId("guardrails.max_daily_budget_delta_pct")}
                    >
                      {fieldError("guardrails.max_daily_budget_delta_pct")}
                    </span>
                  )}
                </label>
                <label>
                  <span className="ds-caption">Min daily spend</span>
                  <input
                    type="number"
                    min={0}
                    value={settings.guardrails.min_daily_spend}
                    onChange={(event) =>
                      handleGuardrailChange("min_daily_spend", event.target.value)
                    }
                    className={
                      fieldError("guardrails.min_daily_spend") ? styles.inputInvalid : undefined
                    }
                    aria-invalid={fieldError("guardrails.min_daily_spend") ? true : false}
                    aria-describedby={fieldErrorId("guardrails.min_daily_spend")}
                  />
                  {fieldError("guardrails.min_daily_spend") && (
                    <span
                      className={`${styles.fieldError} ds-caption`}
                      id={fieldErrorId("guardrails.min_daily_spend")}
                    >
                      {fieldError("guardrails.min_daily_spend")}
                    </span>
                  )}
                </label>
                <label>
                  <span className="ds-caption">ROAS floor</span>
                  <input
                    type="number"
                    step="0.1"
                    value={settings.guardrails.roas_floor ?? ""}
                    onChange={(event) =>
                      handleGuardrailChange("roas_floor", event.target.value)
                    }
                    placeholder="—"
                    className={
                      fieldError("guardrails.roas_floor") ? styles.inputInvalid : undefined
                    }
                    aria-invalid={fieldError("guardrails.roas_floor") ? true : false}
                    aria-describedby={fieldErrorId("guardrails.roas_floor")}
                  />
                  {fieldError("guardrails.roas_floor") && (
                    <span
                      className={`${styles.fieldError} ds-caption`}
                      id={fieldErrorId("guardrails.roas_floor")}
                    >
                      {fieldError("guardrails.roas_floor")}
                    </span>
                  )}
                </label>
                <label>
                  <span className="ds-caption">CPA ceiling</span>
                  <input
                    type="number"
                    step="0.1"
                    value={settings.guardrails.cpa_ceiling ?? ""}
                    onChange={(event) =>
                      handleGuardrailChange("cpa_ceiling", event.target.value)
                    }
                    placeholder="—"
                    className={
                      fieldError("guardrails.cpa_ceiling") ? styles.inputInvalid : undefined
                    }
                    aria-invalid={fieldError("guardrails.cpa_ceiling") ? true : false}
                    aria-describedby={fieldErrorId("guardrails.cpa_ceiling")}
                  />
                  {fieldError("guardrails.cpa_ceiling") && (
                    <span
                      className={`${styles.fieldError} ds-caption`}
                      id={fieldErrorId("guardrails.cpa_ceiling")}
                    >
                      {fieldError("guardrails.cpa_ceiling")}
                    </span>
                  )}
                </label>
              </div>

              {guardrailNarratives.length > 0 && (
                <div className={styles.guardrailNarratives} aria-live="polite">
                  <h4 className="ds-subtitle">How these guardrails behave</h4>
                  <ul className={styles.guardrailNarrativesList}>
                    {guardrailNarratives.map((narrative) => (
                      <li
                        key={narrative.id}
                        className={styles.guardrailNarrative}
                        data-tone={narrative.tone}
                      >
                        <header className={styles.guardrailNarrativeHeader}>
                          <span className="ds-body-strong">{narrative.title}</span>
                          <p className="ds-caption">{narrative.summary}</p>
                        </header>
                        <p className={`${styles.guardrailNarrativeBody} ds-caption`}>
                          {narrative.rationale}
                        </p>
                        {narrative.example && (
                          <p className={`${styles.guardrailNarrativeExample} ds-caption`}>
                            {narrative.example}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </fieldset>

            <fieldset className={styles.fieldset}>
              <legend className="ds-caption">Consent &amp; retention</legend>
              <div className={styles.gridRow}>
                <label>
                  <span className="ds-caption">Consent status</span>
                  <select
                    value={settings.consent.status}
                    onChange={(event) =>
                      handleConsentChange(event.target.value as ConsentStatus)
                    }
                  >
                    {consentStatuses.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="ds-caption">Consent actor</span>
                  <input
                    type="email"
                    value={settings.consent.actor ?? ""}
                    onChange={(event) =>
                      setSettings((prev) =>
                        prev
                          ? {
                              ...prev,
                              consent: {
                                ...prev.consent,
                                actor: event.target.value || null,
                              },
                            }
                          : prev,
                      )
                    }
                  />
                </label>
                <label>
                  <span className="ds-caption">Consent version</span>
                  <input
                    type="text"
                    value={settings.consent.version}
                    onChange={(event) =>
                      setSettings((prev) =>
                        prev
                          ? {
                              ...prev,
                              consent: {
                                ...prev.consent,
                                version: event.target.value || "1.0",
                              },
                            }
                          : prev,
                      )
                    }
                  />
                </label>
              </div>
              <label>
                <span className="ds-caption">Data retention (days)</span>
                <input
                  type="number"
                  min={0}
                  value={settings.retention_days}
                  onChange={(event) =>
                    handleInputChange("retention_days", Number(event.target.value))
                  }
                  className={fieldError("retention_days") ? styles.inputInvalid : undefined}
                  aria-invalid={fieldError("retention_days") ? true : false}
                  aria-describedby={fieldErrorId("retention_days")}
                />
                {fieldError("retention_days") && (
                  <span
                    className={`${styles.fieldError} ds-caption`}
                    id={fieldErrorId("retention_days")}
                  >
                    {fieldError("retention_days")}
                  </span>
                )}
              </label>
              <label>
                <span className="ds-caption">Notes</span>
                <textarea
                  value={settings.notes ?? ""}
                  onChange={(event) => handleInputChange("notes", event.target.value || null)}
                  rows={3}
                />
              </label>
            </fieldset>

            <button
              className={`${styles.primaryButton} ds-pill ds-body-strong`}
              type="submit"
              disabled={saving}
            >
              {saving ? "Saving…" : "Save automation settings"}
            </button>
            </form>

            <aside className={styles.meta}>
              <h3 className="ds-title">Current status</h3>
              <AutomationAuditList
                audits={onboardingAudits}
                loading={onboarding.loading}
                isFallback={onboarding.isFallback}
                errorMessage={fallbackDetails ? fallbackDetails.summary : onboardingErrorMessage}
                metaLabel={fallbackDetails?.title ?? undefined}
                limit={5}
                className={styles.auditRail}
              />
              <ContextPanel tags={contextTags} warnings={contextWarnings} />
              <dl>
                <div>
                  <dt className="ds-caption">Mode</dt>
                  <dd className="ds-body">{settings.mode}</dd>
                </div>
                <div>
                  <dt className="ds-caption">Pushes enabled</dt>
                  <dd className="ds-body">{settings.pushes_enabled ? "Yes" : "No"}</dd>
                </div>
                <div>
                  <dt className="ds-caption">Consent status</dt>
                  <dd className="ds-body">{settings.consent.status}</dd>
                </div>
                <div>
                  <dt className="ds-caption">Consent actor</dt>
                  <dd className="ds-body">{settings.consent.actor ?? "—"}</dd>
                </div>
                <div>
                  <dt className="ds-caption">Last export</dt>
                  <dd className="ds-body">{formatDateTime(settings.last_export_at)}</dd>
                </div>
                <div>
                  <dt className="ds-caption">Last delete</dt>
                  <dd className="ds-body">{formatDateTime(settings.last_delete_at)}</dd>
                </div>
                <div>
                  <dt className="ds-caption">Last updated</dt>
                  <dd className="ds-body">
                    {formatDateTime(responseMeta?.updated_at ?? settings.last_updated_at)}
                  </dd>
                </div>
                <div>
                  <dt className="ds-caption">Updated by</dt>
                  <dd className="ds-body">{settings.updated_by ?? "—"}</dd>
                </div>
              </dl>
            </aside>
          </div>

          <section className={styles.trustSection} aria-labelledby="automation-trust-heading">
            <div className={styles.trustIntro}>
              <h3 id="automation-trust-heading" className="ds-title">
                Automation trust
              </h3>
              <p className="ds-body">
                Review recent automation decisions and guardrail posture before re-enabling automated pushes.
              </p>
            </div>
            <div className={styles.trustGrid}>
              <div className={styles.readinessCard}>
                <AutomationReadinessCard snapshot={readinessSnapshot} loading={readinessLoading} />
              </div>
              <AutomationAuditTimeline
                className={styles.timelinePanel}
                items={auditTimeline}
                loading={auditLoading}
                error={auditError}
              />
              <GuardrailBreachPanel
                guardrails={guardrailSegments}
                generatedAt={guardrailGeneratedAt}
                loading={guardrailLoading}
                error={guardrailError}
                onNavigate={handleOpenDashboard}
              />
            </div>
          </section>
        </>
      )}
      </div>
    </Layout>
  );
}
