import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";

import { AutomationAuditList } from "../components/AutomationAuditList";
import styles from "../styles/automations.module.css";
import { Layout } from "../components/Layout";
import { ContextPanel } from "../components/ContextPanel";
import {
  fetchAutomationSettings,
  updateAutomationSettings,
} from "../lib/api";
import { useDemo } from "../lib/demo";
import { useOnboardingProgress } from "../hooks/useOnboardingProgress";
import type {
  AutomationMode,
  AutomationSettings,
  AutomationSettingsResponse,
  AutomationUpdatePayload,
  ConsentStatus,
} from "../types/automation";

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-tenant";
const UPDATED_BY = process.env.NEXT_PUBLIC_OPERATOR_EMAIL ?? "ops@weathervane";

const automationModes: { value: AutomationMode; label: string; description: string }[] = [
  { value: "manual", label: "Manual", description: "Read-only plan & proof" },
  { value: "assist", label: "Assist", description: "Require approvals before pushes" },
  { value: "autopilot", label: "Autopilot", description: "Auto-push within guardrails" },
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
  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [responseMeta, setResponseMeta] = useState<AutomationSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const { isDemoActive } = useDemo();
  const onboarding = useOnboardingProgress({
    tenantId: TENANT_ID,
    mode: isDemoActive ? "demo" : "live",
  });
  const onboardingAudits = onboarding.audits;
  const onboardingErrorMessage = onboarding.error?.message ?? null;

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

  const handleRetry = () => setReloadCount((value) => value + 1);

  const changeWindowsText = useMemo(
    () => settings?.guardrails.change_windows.join(", ") ?? "",
    [settings?.guardrails.change_windows],
  );

  const contextTags = responseMeta?.context_tags ?? [];
  const contextWarnings = responseMeta?.context_warnings ?? [];

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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settings) return;
    setSaving(true);
    setStatusMessage(null);
    setError(null);

    const payload: AutomationUpdatePayload = {
      mode: settings.mode,
      pushes_enabled: settings.pushes_enabled,
      daily_push_cap: settings.daily_push_cap,
      push_window_start_utc: settings.push_window_start_utc,
      push_window_end_utc: settings.push_window_end_utc,
      guardrails: settings.guardrails,
      consent: settings.consent,
      retention_days: settings.retention_days,
      notes: settings.notes,
      updated_by: UPDATED_BY,
    };

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

  return (
    <Layout>
      <Head>
        <title>WeatherVane · Automations</title>
      </Head>
      <div className={styles.root}>
        <section className={styles.header}>
          <h2 className="ds-title">Guided automation &amp; guardrails</h2>
          <p className="ds-body">
            Control how WeatherVane pushes budgets, maintain tenant consent, and keep your guardrails in
            sync with finance. Changes sync instantly to the API and are captured in the audit log.
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
          <button type="button" onClick={handleRetry} className={`${styles.retryButton} ds-body-strong`}>
            Retry loading settings
          </button>
        </div>
      )}
      {statusMessage && (
        <p className={`${styles.success} ds-body`} role="status" aria-live="polite">
          {statusMessage}
        </p>
      )}

      {!loading && settings && (
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
                  />
                </label>
                <label>
                  <span className="ds-caption">Push window start (UTC)</span>
                  <input
                    type="time"
                    value={settings.push_window_start_utc ?? ""}
                    onChange={(event) =>
                      handleInputChange("push_window_start_utc", event.target.value || null)
                    }
                  />
                </label>
                <label>
                  <span className="ds-caption">Push window end (UTC)</span>
                  <input
                    type="time"
                    value={settings.push_window_end_utc ?? ""}
                    onChange={(event) =>
                      handleInputChange("push_window_end_utc", event.target.value || null)
                    }
                  />
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
                />
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
                  />
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
                  />
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
                  />
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
                  />
                </label>
              </div>
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
                />
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
              errorMessage={onboardingErrorMessage}
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
      )}
      </div>
    </Layout>
  );
}
