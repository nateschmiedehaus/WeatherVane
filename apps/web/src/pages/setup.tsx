import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

import { AutomationAuditList } from "../components/AutomationAuditList";
import { Layout } from "../components/Layout";
import { OnboardingConnectorList } from "../components/OnboardingConnectorList";
import { useOnboardingProgress } from "../hooks/useOnboardingProgress";
import { recordOnboardingEvent } from "../lib/api";
import { useDemo } from "../lib/demo";
import styles from "../styles/setup.module.css";
import type { OnboardingMode } from "../types/onboarding";

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-tenant";

function formatTimestamp(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toLocaleString();
}

const MODE_OPTIONS: {
  value: OnboardingMode;
  label: string;
  helper: string;
}[] = [
  {
    value: "live",
    label: "Live tenant",
    helper: "Connector runs and guardrail audits from your production tenant.",
  },
  {
    value: "demo",
    label: "Guided demo snapshot",
    helper: "Use the safe sandbox while rehearsing the hand-off with stakeholders.",
  },
];

export default function SetupPage() {
  const router = useRouter();
  const [mode, setMode] = useState<OnboardingMode>("live");
  const [hasRecordedOpen, setHasRecordedOpen] = useState(false);
  const initialMode = useRef<OnboardingMode>("live");
  const { isDemoActive, activateDemo, resetDemo } = useDemo();

  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    const queryMode = router.query.mode === "demo" ? "demo" : "live";
    initialMode.current = queryMode;
    setMode(queryMode);
  }, [router.isReady, router.query.mode]);

  useEffect(() => {
    if (!router.isReady || hasRecordedOpen) {
      return;
    }
    setHasRecordedOpen(true);
    void recordOnboardingEvent(TENANT_ID, "setup.opened", mode, {
      initial_mode: initialMode.current,
      demo_active: isDemoActive,
    });
  }, [router.isReady, hasRecordedOpen, mode, isDemoActive]);

  const onboarding = useOnboardingProgress({
    tenantId: TENANT_ID,
    mode,
  });

  const connectors = onboarding.connectors;
  const audits = onboarding.audits;

  const readyConnectorCount = useMemo(
    () => connectors.filter((item) => item.status === "ready").length,
    [connectors],
  );

  const connectorMeta = useMemo(() => {
    const parts: string[] = [`${readyConnectorCount} of ${connectors.length} connected`];
    if (onboarding.loading) {
      parts.push("syncing…");
    } else {
      const updated = formatTimestamp(onboarding.snapshot?.generated_at ?? null);
      if (updated) {
        parts.push(`updated ${updated}`);
      }
    }
    if (onboarding.isFallback) {
      parts.push(mode === "live" ? "fallback to demo" : "demo snapshot");
    } else {
      parts.push(mode === "live" ? "live snapshot" : "guided snapshot");
    }
    return parts.join(" · ");
  }, [
    connectors,
    readyConnectorCount,
    onboarding.loading,
    onboarding.snapshot?.generated_at,
    onboarding.isFallback,
    mode,
  ]);

  const automationMeta = useMemo(() => {
    const prefix = mode === "live" ? "Live guardrails" : "Demo proof";
    if (onboarding.loading) {
      return `${prefix} · syncing…`;
    }
    const updated = formatTimestamp(onboarding.snapshot?.generated_at ?? null);
    return updated ? `${prefix} · updated ${updated}` : prefix;
  }, [mode, onboarding.loading, onboarding.snapshot?.generated_at]);

  const actionableConnectors = useMemo(
    () => connectors.filter((item) => item.action),
    [connectors],
  );

  const handleModeChange = useCallback(
    (nextMode: OnboardingMode) => {
      if (mode === nextMode) {
        return;
      }
      setMode(nextMode);
      void router.replace(
        {
          pathname: router.pathname,
          query: nextMode === "live" ? {} : { mode: "demo" },
        },
        undefined,
        { shallow: true },
      );
      void recordOnboardingEvent(TENANT_ID, "setup.mode_changed", nextMode, {
        from_mode: mode,
        demo_active: isDemoActive,
      });
    },
    [mode, router, isDemoActive],
  );

  const handleViewLivePlan = useCallback(async () => {
    resetDemo();
    await recordOnboardingEvent(TENANT_ID, "setup.view_live_plan", mode, {
      demo_active_before: isDemoActive,
    });
    await router.push("/plan");
  }, [mode, resetDemo, router, isDemoActive]);

  const handleRevisitDemo = useCallback(async () => {
    activateDemo();
    await recordOnboardingEvent(TENANT_ID, "setup.revisit_demo_plan", mode, {
      demo_active_before: isDemoActive,
    });
    await router.push({
      pathname: "/plan",
      query: { demo: "1" },
    });
  }, [activateDemo, mode, router, isDemoActive]);

  return (
    <Layout>
      <Head>
        <title>WeatherVane · Setup</title>
      </Head>
      <div className={styles.root}>
        <section className={styles.hero} aria-label="Demo to live bridge">
          <div className={styles.heroSplit}>
            <div className={styles.heroCopy}>
              <p className={`${styles.heroEyebrow} ds-eyebrow`}>Demo → live bridge</p>
              <h2 className={`${styles.heroTitle} ds-display`}>Launch your WeatherVane setup</h2>
              <p className={`${styles.heroBody} ds-body`}>
                Track connector readiness, guardrail proofs, and hand-offs so the plan from the
                guided tour becomes a production workflow. Toggle between demo and live snapshots at
                any time.
              </p>
              <div className={styles.heroActions}>
                <button type="button" className={styles.primaryAction} onClick={handleViewLivePlan}>
                  View live plan
                </button>
                <button
                  type="button"
                  className={styles.secondaryAction}
                  onClick={handleRevisitDemo}
                >
                  Revisit demo plan
                </button>
              </div>
            </div>
            <div className={styles.modeSwitch}>
              <h3 className={`${styles.modeHeading} ds-caption`}>Snapshot mode</h3>
              <div className={styles.modeButtons}>
                {MODE_OPTIONS.map((option) => {
                  const isActive = mode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`${styles.modeButton} ${isActive ? styles.modeButtonActive : ""}`}
                      onClick={() => handleModeChange(option.value)}
                      aria-pressed={isActive}
                    >
                      <span className={styles.modeLabel}>{option.label}</span>
                      <span className={styles.modeHelper}>{option.helper}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className={styles.progressSection} aria-label="Connector and automation progress">
          <h3 className={`${styles.progressHeading} ds-title`}>Progress trackers</h3>
          <div className={styles.progressGrid}>
            <OnboardingConnectorList
              connectors={connectors}
              metaLabel={connectorMeta}
              loading={onboarding.loading}
              isFallback={onboarding.isFallback}
              errorMessage={onboarding.error?.message ?? null}
              className={styles.panel}
            />
            <AutomationAuditList
              audits={audits}
              metaLabel={automationMeta}
              loading={onboarding.loading}
              isFallback={onboarding.isFallback}
              errorMessage={onboarding.error?.message ?? null}
              className={styles.panel}
            />
          </div>
        </section>

        {actionableConnectors.length > 0 && (
          <section className={styles.actionPanel} aria-label="Immediate actions">
            <header>
              <h3 className={`${styles.actionTitle} ds-subtitle`}>Unblock these next</h3>
              <span className="ds-badge" data-tone="info">
                {actionableConnectors.length}
              </span>
            </header>
            <ul className={styles.actionList}>
              {actionableConnectors.map((connector) => (
                <li key={connector.slug} className="ds-body">
                  <strong>{connector.label}:</strong> {connector.action}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={styles.checklistSection} aria-label="Setup checklist">
          <h3 className="ds-title">Setup checklist</h3>
          <ol className={styles.checklist}>
            <li className={`${styles.checklistItem} ds-body`}>
              Share Shopify, Meta, Google Ads, and Klaviyo credentials (or approve existing invites)
              so ingestion can pull the first lookback window.
            </li>
            <li className={`${styles.checklistItem} ds-body`}>
              Run the worker pipeline (
              <code>python apps/worker/run.py {TENANT_ID}</code>) or schedule it via Prefect to
              generate a fresh plan and guardrail proofs.
            </li>
            <li className={`${styles.checklistItem} ds-body`}>
              Review the Plan and Automations surfaces in live mode, then capture exec sign-off with
              the audit trail above.
            </li>
          </ol>
          <div className={`${styles.supportRow} ds-caption`}>
            <span>Need help? Email</span>
            <a href="mailto:founders@weathervane.dev">founders@weathervane.dev</a>
            <span>or review docs/DEVELOPMENT.md for implementation notes.</span>
          </div>
        </section>
      </div>
    </Layout>
  );
}
