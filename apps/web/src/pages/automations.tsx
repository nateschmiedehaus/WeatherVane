import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";

import styles from "../styles/automations.module.css";
import { Layout } from "../components/Layout";
import { ContextPanel } from "../components/ContextPanel";
import {
  fetchAutomationSettings,
  updateAutomationSettings,
} from "../lib/api";
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
        <h2>Guided automation & guardrails</h2>
        <p>
          Control how WeatherVane pushes budgets, maintain tenant consent, and keep your guardrails in
          sync with finance. Changes sync instantly to the API and are captured in the audit log.
        </p>
        </section>

      {loading && (
        <p className={styles.status} role="status" aria-live="polite">
          Loading automation settings…
        </p>
      )}
      {error && (
        <div className={styles.error} role="alert">
          <p>{error}</p>
          <button type="button" onClick={handleRetry} className={styles.retryButton}>
            Retry loading settings
          </button>
        </div>
      )}
      {statusMessage && (
        <p className={styles.success} role="status" aria-live="polite">
          {statusMessage}
        </p>
      )}

      {!loading && settings && (
        <div className={styles.layout}>
          <form className={styles.form} onSubmit={handleSubmit}>
            <fieldset className={styles.fieldset}>
              <legend>Automation mode</legend>
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
                      <strong>{mode.label}</strong>
                      <p>{mode.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className={styles.fieldset}>
              <legend>Push guardrails</legend>
              <div className={styles.gridRow}>
                <label>
                  Daily push cap
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
                  Push window start (UTC)
                  <input
                    type="time"
                    value={settings.push_window_start_utc ?? ""}
                    onChange={(event) =>
                      handleInputChange("push_window_start_utc", event.target.value || null)
                    }
                  />
                </label>
                <label>
                  Push window end (UTC)
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
                Enable automated pushes within guardrails
              </label>

              <label>
                Change windows (comma separated)
                <input
                  type="text"
                  value={changeWindowsText}
                  onChange={(event) => handleGuardrailChange("change_windows", event.target.value)}
                  placeholder="e.g. weekdays, black_friday"
                />
              </label>

              <div className={styles.gridRow}>
                <label>
                  Max daily delta %
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
                  Min daily spend
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
                  ROAS floor
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
                  CPA ceiling
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
              <legend>Consent & retention</legend>
              <div className={styles.gridRow}>
                <label>
                  Consent status
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
                  Consent actor
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
                  Consent version
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
                Data retention (days)
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
                Notes
                <textarea
                  value={settings.notes ?? ""}
                  onChange={(event) => handleInputChange("notes", event.target.value || null)}
                  rows={3}
                />
              </label>
            </fieldset>

            <button className={styles.primaryButton} type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save automation settings"}
            </button>
          </form>

          <aside className={styles.meta}>
            <h3>Current status</h3>
            <ContextPanel tags={contextTags} warnings={contextWarnings} />
            <dl>
              <div>
                <dt>Mode</dt>
                <dd>{settings.mode}</dd>
              </div>
              <div>
                <dt>Pushes enabled</dt>
                <dd>{settings.pushes_enabled ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt>Consent status</dt>
                <dd>{settings.consent.status}</dd>
              </div>
              <div>
                <dt>Consent actor</dt>
                <dd>{settings.consent.actor ?? "—"}</dd>
              </div>
              <div>
                <dt>Last export</dt>
                <dd>{formatDateTime(settings.last_export_at)}</dd>
              </div>
              <div>
                <dt>Last delete</dt>
                <dd>{formatDateTime(settings.last_delete_at)}</dd>
              </div>
              <div>
                <dt>Last updated</dt>
                <dd>{formatDateTime(responseMeta?.updated_at ?? settings.last_updated_at)}</dd>
              </div>
              <div>
                <dt>Updated by</dt>
                <dd>{settings.updated_by ?? "—"}</dd>
              </div>
            </dl>
          </aside>
        </div>
      )}
      </div>
    </Layout>
  );
}
