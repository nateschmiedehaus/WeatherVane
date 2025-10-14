import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import {
  getAutomationModeLabel,
  getChannelLabel,
  type AutomationAuditStatus,
  type ConnectorStatus,
} from "../demo/onboarding";
import { useDemo, type DemoPreferences } from "../lib/demo";
import { useOnboardingProgress } from "../hooks/useOnboardingProgress";
import { recordOnboardingEvent } from "../lib/api";
import styles from "../styles/demo-tour.module.css";

type TourStep = 0 | 1 | 2;

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-tenant";

const channelOptions: {
  value: DemoPreferences["primaryChannel"];
  label: string;
  description: string;
}[] = [
  {
    value: "meta",
    label: "Meta Ads",
    description: "Weather-triggered Advantage+ budgets and audience swaps",
  },
  {
    value: "google",
    label: "Google Search",
    description: "Bid automation aligned to storm alerts and heat spikes",
  },
  {
    value: "email",
    label: "Email / Klaviyo",
    description: "Lifecycle drips that adapt copy and send cadence to weather",
  },
  {
    value: "pos",
    label: "Shopify POS",
    description: "Localized in-store prompts and signage for swing events",
  },
];

const automationComfortOptions: {
  value: DemoPreferences["automationComfort"];
  label: string;
  helper: string;
}[] = [
  {
    value: "manual",
    label: "Manual – keep recommendations read-only",
    helper: "Review every weather move; nothing pushes without your sign-off.",
  },
  {
    value: "assist",
    label: "Assist – one-click approvals",
    helper: "Preview queued pushes each morning and approve with guardrails enforced.",
  },
  {
    value: "autopilot",
    label: "Autopilot – autonomous within safety limits",
    helper: "WeatherVane pushes inside your ramp caps; shadow logs capture every action.",
  },
];

export function DemoTourDrawer() {
  const {
    isTourOpen,
    closeTour: closeTourContext,
    preferences,
    setPreferences,
    activateDemo,
    resetDemo,
  } = useDemo();
  const [step, setStep] = useState<TourStep>(0);
  const [draftPrefs, setDraftPrefs] = useState<DemoPreferences>(preferences);
  const router = useRouter();
  const startButtonRef = useRef<HTMLButtonElement | null>(null);

  const onboarding = useOnboardingProgress({
    tenantId: TENANT_ID,
    mode: "demo",
    enabled: isTourOpen,
  });

  const connectorProgress = onboarding.connectors;
  const automationAuditPreview = onboarding.audits;
  const readyConnectorCount = useMemo(
    () => connectorProgress.filter((item) => item.status === "ready").length,
    [connectorProgress],
  );
  const automationModeLabel = useMemo(
    () => getAutomationModeLabel(draftPrefs.automationComfort),
    [draftPrefs.automationComfort],
  );
  const primaryChannelOption = useMemo(
    () => channelOptions.find((option) => option.value === draftPrefs.primaryChannel),
    [draftPrefs.primaryChannel],
  );
  const automationModeOption = useMemo(
    () =>
      automationComfortOptions.find((option) => option.value === draftPrefs.automationComfort),
    [draftPrefs.automationComfort],
  );
  const generatedLabel = useMemo(() => {
    const stamp = onboarding.snapshot?.generated_at ?? null;
    if (!stamp) {
      return null;
    }
    const parsed = new Date(stamp);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed.toLocaleString();
  }, [onboarding.snapshot?.generated_at]);
  const connectorMeta = useMemo(() => {
    const parts: string[] = [
      `${readyConnectorCount} of ${connectorProgress.length} connected`,
    ];
    if (onboarding.loading) {
      parts.push("syncing…");
    } else if (generatedLabel) {
      parts.push(`updated ${generatedLabel}`);
    }
    if (onboarding.isFallback) {
      parts.push("demo snapshot");
    }
    return parts.join(" · ");
  }, [
    connectorProgress.length,
    generatedLabel,
    onboarding.isFallback,
    onboarding.loading,
    readyConnectorCount,
  ]);
  const onboardingErrorMessage = onboarding.error?.message ?? null;

  const connectorStatusLabels: Record<ConnectorStatus, string> = {
    ready: "Connected",
    in_progress: "Configuring",
    action_needed: "Action needed",
  };
  const connectorItemClasses: Record<ConnectorStatus, string> = {
    ready: styles.connectorReady,
    in_progress: styles.connectorConfiguring,
    action_needed: styles.connectorActionNeeded,
  };
  const connectorBadgeTone: Record<ConnectorStatus, "success" | "info" | "caution"> = {
    ready: "success",
    in_progress: "info",
    action_needed: "caution",
  };

  const auditStatusLabels: Record<AutomationAuditStatus, string> = {
    approved: "Logged",
    pending: "Pending approval",
    shadow: "Shadow proof",
  };
  const auditBadgeTone: Record<AutomationAuditStatus, "success" | "caution" | "info"> = {
    approved: "success",
    pending: "caution",
    shadow: "info",
  };

  const handleCloseTour = useCallback(
    (reason: "close" | "backdrop" | "skip" | "complete" = "close") => {
      void recordOnboardingEvent(TENANT_ID, "tour.closed", "demo", { step, reason });
      closeTourContext();
    },
    [closeTourContext, step],
  );

  useEffect(() => {
    if (!isTourOpen) {
      return;
    }
    setStep(0);
    setDraftPrefs(preferences);
    const timer = window.setTimeout(() => {
      startButtonRef.current?.focus();
    }, 30);
    return () => window.clearTimeout(timer);
  }, [isTourOpen, preferences]);

  useEffect(() => {
    if (!isTourOpen) {
      return;
    }
    void recordOnboardingEvent(TENANT_ID, "tour.opened", "demo");
  }, [isTourOpen]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleCloseTour("close");
      }
    };
    if (!isTourOpen) return;
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isTourOpen, handleCloseTour]);

  useEffect(() => {
    if (!isTourOpen) {
      return;
    }
    void recordOnboardingEvent(TENANT_ID, "tour.step_viewed", "demo", { step });
  }, [isTourOpen, step]);

  const handleStartTour = () => {
    void recordOnboardingEvent(TENANT_ID, "tour.step_start", "demo", { from_step: step, to_step: 1 });
    setStep(1);
  };

  const handleIntakeNext = () => {
    setPreferences(draftPrefs);
    void recordOnboardingEvent(TENANT_ID, "tour.step_start", "demo", { from_step: step, to_step: 2 });
    void recordOnboardingEvent(TENANT_ID, "tour.preferences_saved", "demo", {
      primary_channel: draftPrefs.primaryChannel,
      automation_comfort: draftPrefs.automationComfort,
    });
    setStep(2);
  };

  const handleLaunchDemo = async () => {
    setPreferences(draftPrefs);
    activateDemo();
    await recordOnboardingEvent(TENANT_ID, "tour.launch_demo", "demo", {
      primary_channel: draftPrefs.primaryChannel,
      automation_comfort: draftPrefs.automationComfort,
    });
    await router.push({
      pathname: "/plan",
      query: { demo: "1" },
    });
  };

  const handleLaunchSetup = async () => {
    setPreferences(draftPrefs);
    resetDemo();
    await recordOnboardingEvent(TENANT_ID, "tour.launch_setup", "demo", {
      primary_channel: draftPrefs.primaryChannel,
      automation_comfort: draftPrefs.automationComfort,
    });
    handleCloseTour("complete");
    await router.push({
      pathname: "/setup",
      query: { mode: "live" },
    });
  };

  const stepTitle = useMemo(() => {
    switch (step) {
      case 0:
        return "Weather story of the week";
      case 1:
        return "Tailor your sample plan";
      case 2:
        return "Demo plan preview";
      default:
        return "";
    }
  }, [step]);

  if (!isTourOpen) {
    return null;
  }

  return (
    <>
      <div className={styles.backdrop} role="presentation" onClick={() => handleCloseTour("backdrop")} />
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-tour-title"
      >
        <header className={styles.header}>
          <div>
            <p className={styles.stepChip}>
              Step {step + 1} of 3
            </p>
            <h2 id="demo-tour-title">{stepTitle}</h2>
          </div>
          <button type="button" onClick={() => handleCloseTour("close")} className={styles.closeButton}>
            <span className="sr-only">Close demo tour</span>
            ×
          </button>
        </header>

        {step === 0 && (
          <div className={styles.body}>
            <p className={styles.storyLead}>
              “Sunbelt heatwave – sunscreen up 22%. NYC rain – shift spend to umbrellas.
              We’ll walk through the plan, proof, and automation guardrails in under two minutes.”
            </p>
            <ul className={styles.storyList}>
              <li>Plan highlights showing the top three weather-driven moves</li>
              <li>Stories timeline with what actually happened when brands acted</li>
              <li>Automation audit log so execs trust Assist and Autopilot modes</li>
            </ul>
            <div className={styles.ctaRow}>
              <button
                type="button"
                ref={startButtonRef}
                className={styles.primaryButton}
                onClick={handleStartTour}
              >
                Start guided tour
              </button>
              <a
                href="https://weathervane.example.com/demo-walkthrough"
                target="_blank"
                rel="noreferrer"
                className={styles.secondaryLink}
              >
                Watch 90s walkthrough
              </a>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className={styles.body}>
            <fieldset className={styles.fieldset}>
              <legend>Which channel do you want to see first?</legend>
              <div className={styles.cardList}>
                {channelOptions.map((option) => (
                  <label key={option.value} className={styles.radioCard}>
                    <input
                      type="radio"
                      name="demo-channel"
                      value={option.value}
                      checked={draftPrefs.primaryChannel === option.value}
                      onChange={() =>
                        setDraftPrefs((prev) => ({ ...prev, primaryChannel: option.value }))
                      }
                    />
                    <div>
                      <strong>{option.label}</strong>
                      <p>{option.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className={styles.fieldset}>
              <legend>How hands-on should automations feel?</legend>
              <div className={styles.cardList}>
                {automationComfortOptions.map((option) => (
                  <label key={option.value} className={styles.radioCard}>
                    <input
                      type="radio"
                      name="demo-automation"
                      value={option.value}
                      checked={draftPrefs.automationComfort === option.value}
                      onChange={() =>
                        setDraftPrefs((prev) => ({ ...prev, automationComfort: option.value }))
                      }
                    />
                    <div>
                      <strong>{option.label}</strong>
                      <p>{option.helper}</p>
                    </div>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className={styles.ctaRow}>
              <button type="button" className={styles.primaryButton} onClick={handleIntakeNext}>
                Next: Preview your plan
              </button>
              <button type="button" className={styles.tertiaryButton} onClick={() => handleCloseTour("skip")}>
                Skip tour
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className={styles.body}>
            <p className={styles.storyLead}>
              We pre-filled a seven-day plan, Stories deck, and automation audit trail based on your
              answers. Explore how WeatherVane narrates opportunities and keeps guardrails tight.
            </p>

            <section className={styles.previewSection} aria-label="Connector setup progress">
              <div className={styles.previewHeader}>
                <h3>Connector progress</h3>
                <span className={styles.previewMeta}>{connectorMeta}</span>
              </div>
              {onboardingErrorMessage && (
                <p className={styles.previewNotice} role="status">
                  We&apos;ll refresh live data once available — showing the demo snapshot for now.
                  <br />
                  <span className={styles.previewNoticeDetail}>{onboardingErrorMessage}</span>
                </p>
              )}
              <ul className={styles.connectorList}>
                {connectorProgress.map((connector) => (
                  <li
                    key={connector.slug}
                    className={`${styles.connectorItem} ${connectorItemClasses[connector.status]}`}
                  >
                    <div className={styles.connectorHeader}>
                      <div className={styles.connectorTitle}>
                        <strong>{connector.label}</strong>
                        {connector.focus && <span className={styles.focusPill}>Primary</span>}
                      </div>
                      <span className="ds-badge" data-tone={connectorBadgeTone[connector.status]}>
                        {connectorStatusLabels[connector.status]}
                      </span>
                    </div>
                    <p className={styles.connectorSummary}>{connector.summary}</p>
                    <div className={styles.connectorProgressRow}>
                      <div className={styles.connectorProgressBar}>
                        <div
                          className={styles.connectorProgressFill}
                          style={{ width: `${connector.progress}%` }}
                        />
                      </div>
                      <span className={styles.connectorProgressValue}>{connector.progress}%</span>
                    </div>
                    <div className={styles.connectorFooter}>
                      <span className={styles.connectorTime}>{connector.timeAgo}</span>
                      {connector.action && (
                        <span className={styles.connectorAction}>{connector.action}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className={styles.previewSection} aria-label="Automation audit preview">
              <div className={styles.previewHeader}>
                <h3>Automation audit trail</h3>
                <span className={styles.previewMeta}>
                  {automationModeLabel}
                  {onboarding.loading ? " · syncing…" : onboarding.isFallback ? " · demo proof" : " · live proof"}
                </span>
              </div>
              <ul className={styles.auditList}>
                {automationAuditPreview.map((entry) => (
                  <li key={entry.id} className={styles.auditItem}>
                    <div className={styles.auditHeader}>
                      <div>
                        <strong>{entry.headline}</strong>
                        <p className={styles.auditActor}>{entry.actor}</p>
                      </div>
                      <span className="ds-badge" data-tone={auditBadgeTone[entry.status]}>
                        {auditStatusLabels[entry.status]}
                      </span>
                    </div>
                    <p className={styles.auditDetail}>{entry.detail}</p>
                    <div className={styles.auditFooter}>
                      <span>{entry.timeAgo}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <dl className={styles.previewList}>
              <div>
                <dt>Primary channel</dt>
                <dd>{primaryChannelOption?.label ?? getChannelLabel(draftPrefs.primaryChannel)}</dd>
              </div>
              <div>
                <dt>Automation mode</dt>
                <dd>{automationModeOption?.label ?? automationModeLabel}</dd>
              </div>
              <div>
                <dt>Connector readiness</dt>
                <dd>
                  {readyConnectorCount} of {connectorProgress.length} connected · Shopify + weather
                  context already powering demos.
                </dd>
              </div>
              <div>
                <dt>Audit coverage</dt>
                <dd>Guardrail simulation, approvals, and retention exports ship in exec_review.</dd>
              </div>
            </dl>

            <div className={styles.ctaRow}>
              <button type="button" className={styles.primaryButton} onClick={handleLaunchDemo}>
                Explore sample plan
              </button>
              <button type="button" className={styles.secondaryButton} onClick={handleLaunchSetup}>
                Start live setup
              </button>
              <button type="button" className={styles.tertiaryButton} onClick={() => handleCloseTour("complete")}>
                Close
              </button>
            </div>
            <p className={styles.disclaimer}>
              Demo mode is read-only. Your real campaigns stay untouched — we’ll show how to connect
              Shopify and ad accounts once you’re ready.
            </p>
          </div>
        )}
      </aside>
    </>
  );
}
