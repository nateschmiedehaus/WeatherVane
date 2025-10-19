import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

import { AutomationAuditList } from "../components/AutomationAuditList";
import { ContextPanel } from "../components/ContextPanel";
import { IncrementalityPanel } from "../components/IncrementalityPanel";
import { DisclaimerBanner } from "../components/DisclaimerBanner";
import { Layout } from "../components/Layout";
import { OnboardingConnectorList } from "../components/OnboardingConnectorList";
import styles from "../styles/plan.module.css";
import { fetchPlan } from "../lib/api";
import { useDemo } from "../lib/demo";
import { buildDemoPlan } from "../demo/plan";
import { useOnboardingProgress } from "../hooks/useOnboardingProgress";
import type { ConfidenceLevel, PlanResponse, PlanSlice } from "../types/plan";
import {
  computeHeroMetricSummary,
  deriveOpportunityQueue,
  driverFromSlice,
  type OpportunityKind,
} from "../lib/plan-insights";

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-tenant";
const HORIZON_DAYS = Number(process.env.NEXT_PUBLIC_PLAN_HORIZON ?? "7");
const PLAN_PERSONA_STORAGE_KEY = "wvo-plan-persona-mode";

type PersonaMode = "demo" | "assist" | "autopilot";

interface PersonaOption {
  id: PersonaMode;
  label: string;
  description: string;
  analyticsId: string;
}

const PERSONA_OPTIONS: PersonaOption[] = [
  {
    id: "demo",
    label: "Demo",
    description: "Guided tour with seeded insights",
    analyticsId: "plan.mode.demo",
  },
  {
    id: "assist",
    label: "Assist",
    description: "Operators approve weather moves",
    analyticsId: "plan.mode.assist",
  },
  {
    id: "autopilot",
    label: "Autopilot",
    description: "Guardrails execute autonomously",
    analyticsId: "plan.mode.autopilot",
  },
];

const PERSONA_PROMPTS: Record<
  PersonaMode,
  { title: string; body: string; ctaLabel: string; href: string; analyticsId: string }
> = {
  demo: {
    title: "Graduate from the demo",
    body: "Connect Shopify, Meta, and Google Ads to swap seeded cards for live telemetry. Sarah will see the real ROI strip once connectors finish syncing.",
    ctaLabel: "Open setup bridge",
    href: "/setup",
    analyticsId: "plan.prompt.demo_setup",
  },
  assist: {
    title: "Review today’s diff drawer",
    body: "Approve or adjust the primary automation so Autopilot can inherit your guardrail decisions. Record rationale for Sarah in Stories.",
    ctaLabel: "Jump to Automations",
    href: "/automations?source=plan",
    analyticsId: "plan.prompt.assist_automations",
  },
  autopilot: {
    title: "Monitor WeatherOps uptime",
    body: "Keep an eye on guardrail health and connector latency. Any sustained anomaly will pause Autopilot pushes until an operator acknowledges it.",
    ctaLabel: "Open WeatherOps dashboard",
    href: "/dashboard?source=plan",
    analyticsId: "plan.prompt.autopilot_dashboard",
  },
};

type ScenarioId = "base" | "warm" | "storm";

interface ScenarioOption {
  id: ScenarioId;
  label: string;
  description: string;
  multiplier: number;
  analyticsId: string;
}

const SCENARIO_OPTIONS: ScenarioOption[] = [
  {
    id: "base",
    label: "Base outlook",
    description: "Blended forecast using live telemetry",
    multiplier: 1,
    analyticsId: "plan.scenario.base",
  },
  {
    id: "warm",
    label: "Warm surge",
    description: "Hot front boosts demand by ~8%",
    multiplier: 1.08,
    analyticsId: "plan.scenario.warm",
  },
  {
    id: "storm",
    label: "Storm watch",
    description: "Severe weather dampens spend by ~12%",
    multiplier: 0.88,
    analyticsId: "plan.scenario.storm",
  },
];

const CONFIDENCE_ORDER: ConfidenceLevel[] = ["HIGH", "MEDIUM", "LOW"];

const OPPORTUNITY_LABEL: Record<OpportunityKind, string> = {
  primary: "Primary action",
  followUp: "Follow-up",
  risk: "Risk alert",
};

const OPPORTUNITY_TARGETS: Record<
  OpportunityKind,
  { href: string; label: string; helper: string }
> = {
  primary: {
    href: "/automations?source=plan&view=diff",
    label: "Review diff drawer",
    helper: "Approve to ship the highest-leverage automation.",
  },
  followUp: {
    href: "/stories?source=plan",
    label: "Open Stories",
    helper: "Share context with Sarah so the team stays aligned.",
  },
  risk: {
    href: "/dashboard?tab=guardrails&source=plan",
    label: "Acknowledge guardrail",
    helper: "Resolve the alert so Autopilot can resume confidently.",
  },
};

function formatCurrency(amount: number | null | undefined): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "—";
  const fractionDigits = Math.abs(amount) >= 1000 ? 0 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

function formatCurrencyDelta(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) {
    return "±$0";
  }
  const formatted = formatCurrency(Math.abs(amount));
  return amount > 0 ? `+${formatted}` : `-${formatted}`;
}

function formatRoas(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}×`;
}

function formatDateShort(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatDateLong(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatDateRange(dates: string[]): string {
  if (!dates.length) return "—";
  const sorted = [...dates].sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime(),
  );
  const start = new Date(sorted[0]);
  const end = new Date(sorted[sorted.length - 1]);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "—";

  const startLabel = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const endLabel = end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

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

function formatPercentage(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${Math.round(value)}%`;
}

type ConfidenceBreakdown = Record<ConfidenceLevel, number>;

interface DayOutlook {
  dateKey: string;
  label: string;
  spend: number;
  topDriver: string;
  topConfidence: ConfidenceLevel | null;
  counts: ConfidenceBreakdown;
}

interface ScenarioOutlook extends DayOutlook {
  scenarioSpend: number;
  scenarioDelta: number;
}

interface PlanRow {
  key: string;
  date: string;
  geo: string;
  category: string;
  channel: string;
  spend: string;
  revenueP50: string;
  roasP50: string;
  confidence: string;
  driver: string;
}

export default function PlanPage() {
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [scenarioId, setScenarioId] = useState<ScenarioId>("base");
  const router = useRouter();
  const { isDemoActive, preferences, activateDemo, resetDemo, setPreferences } = useDemo();

  const demoParam = router.query.demo;
  const normalizedDemoParam = Array.isArray(demoParam) ? demoParam[0] : demoParam;
  const wantsDemo =
    router.isReady &&
    typeof normalizedDemoParam !== "undefined" &&
    normalizedDemoParam !== "0" &&
    normalizedDemoParam !== "false";
  const isDemoMode = isDemoActive || wantsDemo;

  const defaultMode: PersonaMode =
    preferences.automationComfort === "autopilot" ? "autopilot" : "assist";
  const [personaMode, setPersonaMode] = useState<PersonaMode>(
    isDemoActive ? "demo" : defaultMode,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(PLAN_PERSONA_STORAGE_KEY);
    if (stored === "demo" || stored === "assist" || stored === "autopilot") {
      setPersonaMode(stored);
    }
  }, []);

  useEffect(() => {
    if (isDemoActive) {
      setPersonaMode("demo");
      return;
    }
    setPersonaMode((current) => {
      if (current === "demo") {
        return preferences.automationComfort === "autopilot" ? "autopilot" : "assist";
      }
      return current;
    });
  }, [isDemoActive, preferences.automationComfort]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PLAN_PERSONA_STORAGE_KEY, personaMode);
  }, [personaMode]);

  const onboarding = useOnboardingProgress({
    tenantId: TENANT_ID,
    mode: isDemoMode ? "demo" : "live",
  });
  const onboardingConnectors = onboarding.connectors;
  const onboardingAudits = onboarding.audits;
  const onboardingReadyCount = useMemo(
    () => onboardingConnectors.filter((item) => item.status === "ready").length,
    [onboardingConnectors],
  );
  const onboardingMeta = useMemo(() => {
    const parts: string[] = [
      `${onboardingReadyCount} of ${onboardingConnectors.length} connected`,
    ];
    if (onboarding.loading) {
      parts.push("syncing…");
    } else {
      const updated = formatTimestamp(onboarding.snapshot?.generated_at ?? null);
      if (updated) {
        parts.push(`updated ${updated}`);
      }
    }
    if (onboarding.isFallback) {
      parts.push("demo snapshot");
    }
    return parts.join(" · ");
  }, [
    onboarding.loading,
    onboarding.snapshot?.generated_at,
    onboarding.isFallback,
    onboardingConnectors,
    onboardingReadyCount,
  ]);
  const onboardingErrorMessage = onboarding.error?.message ?? null;

  const fetchLatestPlan = useCallback(() => {
    let active = true;
    setLoading(true);
    fetchPlan(TENANT_ID, HORIZON_DAYS)
      .then((res) => {
        if (!active) return;
        setPlan(res);
        setError(null);
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message ?? "We ran into an issue loading the latest plan.");
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
    if (wantsDemo && !isDemoActive) {
      activateDemo();
    }
  }, [wantsDemo, isDemoActive, activateDemo]);

  useEffect(() => {
    if (isDemoMode) {
      setPlan(buildDemoPlan(preferences));
      setError(null);
      setLoading(false);
      return;
    }
    const cancel = fetchLatestPlan();
    return cancel;
  }, [isDemoMode, preferences, fetchLatestPlan, reloadCount]);

  const handleRetry = () => setReloadCount((value) => value + 1);

  const handlePersonaChange = useCallback(
    (mode: PersonaMode) => {
      if (mode === personaMode) return;
      setPersonaMode(mode);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(PLAN_PERSONA_STORAGE_KEY, mode);
      }

      if (mode === "demo") {
        if (!isDemoActive) {
          activateDemo();
        }
        router.replace(
          { pathname: router.pathname, query: { ...router.query, demo: "1" } },
          undefined,
          { shallow: true },
        );
        return;
      }

      if (isDemoActive) {
        resetDemo();
      }

      const nextComfort = mode === "autopilot" ? "autopilot" : "assist";
      if (preferences.automationComfort !== nextComfort) {
        setPreferences({ ...preferences, automationComfort: nextComfort });
      }

      const nextQuery = { ...router.query };
      if ("demo" in nextQuery) {
        delete nextQuery.demo;
        router.replace({ pathname: router.pathname, query: nextQuery }, undefined, {
          shallow: true,
        });
      }
    },
    [
      activateDemo,
      isDemoActive,
      personaMode,
      preferences,
      resetDemo,
      router,
      setPreferences,
    ],
  );

  const planSlices = plan?.slices;
  const slices = useMemo(() => planSlices ?? [], [planSlices]);

  const tableRows: PlanRow[] = useMemo(() => {
    if (!slices.length) return [];
    return slices.map((slice) => {
      const roasP50 = slice.expected_roas?.p50 ?? null;
      return {
        key: `${slice.plan_date}-${slice.geo_group_id}-${slice.channel}`,
        date: formatDateShort(slice.plan_date),
        geo: slice.geo_group_id,
        category: slice.category,
        channel: slice.channel,
        spend: formatCurrency(slice.recommended_spend),
        revenueP50: formatCurrency(slice.expected_revenue.p50),
        roasP50: formatRoas(roasP50),
        confidence: slice.confidence,
        driver: driverFromSlice(slice),
      };
    });
  }, [slices]);

  const totalRecommendedSpend = useMemo(() => {
    if (!slices.length) return "—";
    const sum = slices.reduce((acc, slice) => acc + slice.recommended_spend, 0);
    return formatCurrency(sum);
  }, [slices]);

  const totalProjectedRevenue = useMemo(() => {
    if (!slices.length) return "—";
    const sum = slices.reduce((acc, slice) => acc + slice.expected_revenue.p50, 0);
    return formatCurrency(sum);
  }, [slices]);

  const uniqueGeos = useMemo(() => {
    if (!slices.length) return 0;
    return new Set(slices.map((slice) => slice.geo_group_id)).size;
  }, [slices]);

  const planDateRange = useMemo(() => {
    if (!slices.length) return "—";
    const dates = slices.map((slice) => slice.plan_date);
    return formatDateRange(dates);
  }, [slices]);

  const confidenceBreakdown: ConfidenceBreakdown = useMemo(
    () =>
      slices.reduce(
        (acc, slice) => {
          acc[slice.confidence] += 1;
          return acc;
        },
        { HIGH: 0, MEDIUM: 0, LOW: 0 } as ConfidenceBreakdown,
      ),
    [slices],
  );

  const totalConfidenceSlices =
    confidenceBreakdown.HIGH + confidenceBreakdown.MEDIUM + confidenceBreakdown.LOW;

  const dayOutlook: DayOutlook[] = useMemo(() => {
    if (!slices.length) return [];
    const map = new Map<string, DayOutlook>();

    slices.forEach((slice) => {
      const entry =
        map.get(slice.plan_date) ??
        {
          dateKey: slice.plan_date,
          label: formatDateLong(slice.plan_date),
          spend: 0,
          topDriver: driverFromSlice(slice),
          topConfidence: slice.confidence,
          counts: { HIGH: 0, MEDIUM: 0, LOW: 0 },
        };

      const previousSpend = entry.spend;
      entry.spend += slice.recommended_spend;
      entry.counts[slice.confidence] += 1;

      const currentTopConfidenceIndex = entry.topConfidence
        ? CONFIDENCE_ORDER.indexOf(entry.topConfidence)
        : Number.POSITIVE_INFINITY;
      const newConfidenceIndex = CONFIDENCE_ORDER.indexOf(slice.confidence);
      const shouldReplaceDriver =
        slice.recommended_spend > previousSpend || newConfidenceIndex < currentTopConfidenceIndex;

      if (shouldReplaceDriver) {
        entry.topDriver = driverFromSlice(slice);
        entry.topConfidence = slice.confidence;
      }

      map.set(slice.plan_date, entry);
    });

    return [...map.values()].sort(
      (a, b) => new Date(a.dateKey).getTime() - new Date(b.dateKey).getTime(),
    );
  }, [slices]);

  const selectedScenario =
    useMemo(
      () => SCENARIO_OPTIONS.find((option) => option.id === scenarioId) ?? SCENARIO_OPTIONS[0],
      [scenarioId],
    );

  const scenarioOutlook = useMemo<ScenarioOutlook[]>(() => {
    if (!dayOutlook.length) return [];
    return dayOutlook.map((day) => ({
      ...day,
      scenarioSpend: day.spend * selectedScenario.multiplier,
      scenarioDelta: day.spend * (selectedScenario.multiplier - 1),
    }));
  }, [dayOutlook, selectedScenario]);

  const generatedAt = plan?.generated_at ? new Date(plan.generated_at).toLocaleString() : "—";
  const contextTags = plan?.context_tags ?? [];
  const contextWarnings = plan?.context_warnings ?? [];
  const datasetRows =
    (plan?.data_context?.metadata as { dataset_rows?: Record<string, unknown> } | undefined)
      ?.dataset_rows ?? {};
  const weatherSource =
    (plan?.data_context?.metadata as { weather_source?: string } | undefined)?.weather_source ??
    "unknown";

  const opportunityQueue = useMemo(() => deriveOpportunityQueue(slices), [slices]);
  const heroSummary = useMemo(() => computeHeroMetricSummary(slices), [slices]);
  const personaPrompt = PERSONA_PROMPTS[personaMode];

  const heroRoiMultipleLabel =
    heroSummary.roiMultiple === null ? "—" : `${heroSummary.roiMultiple.toFixed(2)}×`;
  const heroRoiDeltaLabel =
    heroSummary.roiDeltaPct === null
      ? "Awaiting telemetry"
      : `${heroSummary.roiDeltaPct >= 0 ? "+" : ""}${heroSummary.roiDeltaPct.toFixed(
          0,
        )}% vs spend`;
  const guardrailConfidenceLabel = formatPercentage(heroSummary.guardrailConfidencePct);
  const guardrailConfidenceValue =
    heroSummary.guardrailConfidencePct === null
      ? 0
      : Math.min(100, Math.max(0, heroSummary.guardrailConfidencePct));
  const heroWeatherSynopsis =
    heroSummary.topDriver ??
    "We will highlight the dominant weather driver as soon as telemetry lands.";

  const hasPlanContent = !loading && !error && slices.length > 0;
  const showPlanSections = !loading && !error;

  return (
    <Layout>
      <Head>
        <title>WeatherVane · Plan</title>
      </Head>
      <div className={styles.root}>
        <DisclaimerBanner message="Predictions reflect historical correlations; causal lift remains under validation until Phase 4 completes." />

        <header className={styles.hero}>
          <div className={styles.heroStrip} data-analytics-id="plan.hero">
            <p className={`${styles.pageEyebrow} ds-eyebrow ds-eyebrow-neutral`}>
              This week’s weather-aware plan
            </p>
            <h2 className={`${styles.pageTitle} ds-title`}>Operator command center</h2>
            <p className={`${styles.pageSubtitle} ds-subtitle`}>
              Prioritise the highest-leverage weather opportunities, quantify guardrail impact, and
              align Sarah and Leo on what happens next.
            </p>
            {isDemoMode && (
              <div className={styles.demoBanner}>
                <span className={styles.demoBadge}>Demo mode</span>
                <p>
                  This preview is seeded with sample data based on your tour answers.{" "}
                  <Link href="/setup" className={styles.demoLink} data-analytics-id="plan.demo.setup">
                    Open the setup bridge
                  </Link>{" "}
                  to connect live systems and graduate into assist or Autopilot mode.
                </p>
              </div>
            )}

            <dl className={styles.heroMetrics}>
              <div>
                <dt>ROI multiple</dt>
                <dd>
                  <span className={styles.metricValue}>{heroRoiMultipleLabel}</span>
                  <span className={styles.metricHint}>{heroRoiDeltaLabel}</span>
                </dd>
              </div>
              <div>
                <dt>Guardrail confidence</dt>
                <dd>
                  <span className={styles.metricValue}>{guardrailConfidenceLabel}</span>
                  <span className={styles.guardrailMeter} aria-hidden="true">
                    <span
                      className={styles.guardrailMeterFill}
                      style={{ width: `${guardrailConfidenceValue}%` }}
                    />
                  </span>
                </dd>
              </div>
              <div>
                <dt>Weather synopsis</dt>
                <dd>
                  <span className={styles.metricValue}>{heroWeatherSynopsis}</span>
                </dd>
              </div>
            </dl>

            <div className={styles.summaryFacts}>
              <dl>
                <div>
                  <dt>Plan window</dt>
                  <dd>{planDateRange}</dd>
                </div>
                <div>
                  <dt>Total recommended spend</dt>
                  <dd>{totalRecommendedSpend}</dd>
                </div>
                <div>
                  <dt>Projected revenue (p50)</dt>
                  <dd>{totalProjectedRevenue}</dd>
                </div>
                <div>
                  <dt>Geographies covered</dt>
                  <dd>{uniqueGeos || "—"}</dd>
                </div>
                <div>
                  <dt>Generated</dt>
                  <dd>{generatedAt}</dd>
                </div>
              </dl>
              {hasPlanContent && (
                <div className={styles.heroActions}>
                  <Link
                    href="/reports?source=plan"
                    className={styles.heroShareCta}
                    data-analytics-id="plan.banner.share"
                  >
                    Open executive report →
                  </Link>
                  <p className={styles.heroActionsHint}>
                    Share this week’s ROI storyline with Sarah ahead of the exec review.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className={styles.modeSwitch} role="radiogroup" aria-label="Plan persona view">
            {PERSONA_OPTIONS.map((option) => {
              const isActive = option.id === personaMode;
              return (
                <button
                  type="button"
                  key={option.id}
                  className={`${styles.modeButton} ${isActive ? styles.modeButtonActive : ""}`}
                  onClick={() => handlePersonaChange(option.id)}
                  data-analytics-id={option.analyticsId}
                  aria-pressed={isActive}
                >
                  <span className={styles.modeLabel}>{option.label}</span>
                  <span className={styles.modeDescription}>{option.description}</span>
                </button>
              );
            })}
          </div>
        </header>

        {loading && (
          <section className={styles.loadingSection} aria-live="polite">
            <p className={styles.loadingMessage}>Stitching weather signals into your plan…</p>
            <div className={styles.skeletonRow} />
            <div className={styles.skeletonGrid}>
              <div className={styles.skeletonCard} />
              <div className={styles.skeletonCard} />
              <div className={styles.skeletonCard} />
            </div>
          </section>
        )}

        {error && (
          <div className={styles.error} role="alert">
            <h3 className={styles.errorTitle}>We couldn’t load your plan</h3>
            <p>{error}</p>
            <p className={styles.errorHelper}>
              This usually resolves within a few seconds. You can retry now or check the worker logs
              for pipeline status.
            </p>
            <div className={styles.errorActions}>
              <button type="button" onClick={handleRetry} className={styles.retryButton}>
                Try again
              </button>
            </div>
          </div>
        )}

        {showPlanSections && (
          <div className={styles.planBody}>
            <div className={styles.primaryColumn}>
              <section className={styles.opportunitiesSection} aria-label="Opportunity queue">
                <div className={styles.sectionHeader}>
                  <h3 className="ds-title">Opportunity queue</h3>
                  <p className="ds-caption">
                    Approve, adjust, or route the highest-impact weather-driven actions.
                  </p>
                </div>
                <div className={styles.opportunityGrid}>
                  {opportunityQueue.map((entry) => {
                    const target = OPPORTUNITY_TARGETS[entry.kind];
                    const key = `${entry.slice.plan_date}-${entry.slice.geo_group_id}-${entry.slice.channel}-${entry.kind}`;
                    const badgeClass =
                      entry.kind === "risk"
                        ? styles.opportunityRisk
                        : entry.kind === "followUp"
                        ? styles.opportunityFollow
                        : styles.opportunityPrimary;
                    return (
                      <article
                        key={key}
                        className={`${styles.opportunityCard} ${badgeClass}`}
                        data-kind={entry.kind}
                      >
                        <header className={styles.opportunityHeader}>
                          <span className={`${styles.opportunityKind} ds-caption`}>
                            {OPPORTUNITY_LABEL[entry.kind]}
                          </span>
                          <span
                            className={`${styles.badge} ${styles[`confidence${entry.slice.confidence}`]}`}
                            aria-label={`Confidence ${entry.slice.confidence.toLowerCase()}`}
                          >
                            {entry.slice.confidence.toLowerCase()}
                          </span>
                        </header>
                        <h4 className={`${styles.opportunityTitle} ds-title`}>
                          {entry.slice.geo_group_id}
                        </h4>
                        <p className={`${styles.opportunityDriver} ds-body`}>{entry.reason}</p>
                        <dl className={styles.opportunityMetrics}>
                          <div>
                            <dt>Recommended spend</dt>
                            <dd>{formatCurrency(entry.slice.recommended_spend)}</dd>
                          </div>
                          <div>
                            <dt>Projected revenue (p50)</dt>
                            <dd>{formatCurrency(entry.slice.expected_revenue.p50)}</dd>
                          </div>
                          <div>
                            <dt>Projected ROAS (p50)</dt>
                            <dd>{formatRoas(entry.slice.expected_roas?.p50 ?? null)}</dd>
                          </div>
                        </dl>
                        <div className={styles.opportunityActions}>
                          <Link
                            href={target.href}
                            className={styles.opportunityLink}
                            data-analytics-id={entry.analyticsId}
                          >
                            {target.label} →
                          </Link>
                          <span className={styles.opportunityHelper}>{target.helper}</span>
                        </div>
                      </article>
                    );
                  })}
                  {!opportunityQueue.length && (
                    <p className={styles.opportunityEmpty}>
                      We’ll surface the largest opportunities here as soon as recommendations are
                      available.
                    </p>
                  )}
                </div>
              </section>

              <section className={styles.dailySection} aria-label="Seven-day outlook">
                <div className={styles.sectionHeader}>
                  <h3 className="ds-title">Seven-day outlook</h3>
                  <p className="ds-caption">
                    Preview how spend shifts across the horizon and explore alternative weather
                    scenarios.
                  </p>
                </div>
                <div className={styles.scenarioSwitch} role="radiogroup" aria-label="Scenario">
                  {SCENARIO_OPTIONS.map((option) => {
                    const isActive = option.id === selectedScenario.id;
                    return (
                      <button
                        type="button"
                        key={option.id}
                        className={`${styles.scenarioButton} ${
                          isActive ? styles.scenarioActive : ""
                        }`}
                        onClick={() => setScenarioId(option.id)}
                        data-analytics-id={option.analyticsId}
                        aria-pressed={isActive}
                      >
                        <span className={styles.scenarioLabel}>{option.label}</span>
                        <span className={styles.scenarioDescription}>{option.description}</span>
                      </button>
                    );
                  })}
                </div>
                <p className={styles.scenarioFootnote}>
                  Scenario effect applied: {selectedScenario.description.toLowerCase()}.
                </p>
                <div className={styles.dayGrid}>
                  {scenarioOutlook.map((day) => (
                    <article key={day.dateKey} className={styles.dayCard}>
                      <header className={styles.dayHeader}>
                        <span className="ds-caption">{day.label}</span>
                        <div className={styles.daySpendGroup}>
                          <span className={styles.daySpendBase}>{formatCurrency(day.spend)}</span>
                          <span className={styles.daySpendScenario}>
                            {formatCurrency(day.scenarioSpend)}
                            <span className={styles.daySpendDelta}>
                              {formatCurrencyDelta(day.scenarioDelta)}
                            </span>
                          </span>
                        </div>
                      </header>
                      <p className={`${styles.dayDriver} ds-body`}>{day.topDriver}</p>
                      <div className={styles.dayConfidence}>
                        {CONFIDENCE_ORDER.map((level) => {
                          const count = day.counts[level];
                          if (!count) return null;
                          return (
                            <span
                              key={level}
                              className={`${styles.badge} ${styles[`confidence${level}`]}`}
                              aria-label={`${count} ${level.toLowerCase()} confidence recommendation${
                                count > 1 ? "s" : ""
                              }`}
                            >
                              {level.toLowerCase()} · {count}
                            </span>
                          );
                        })}
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className={styles.insightsSection} aria-label="Confidence insights">
                <div className={styles.insightsGrid}>
                  <div className={styles.insightTile}>
                    <h4 className="ds-title">
                      {totalConfidenceSlices
                        ? Math.round((confidenceBreakdown.HIGH / totalConfidenceSlices) * 100)
                        : 0}
                      % high confidence
                    </h4>
                    <p className="ds-body">
                      {confidenceBreakdown.HIGH} slices are backed by deep historical coverage and
                      stable causal drivers.
                    </p>
                  </div>
                  <div className={styles.insightTile}>
                    <h4 className="ds-title">{confidenceBreakdown.MEDIUM} medium-confidence slices</h4>
                    <p className="ds-body">
                      These merit manual review. We highlight supporting factors inside the detailed
                      table.
                    </p>
                  </div>
                  <div className={styles.insightTile}>
                    <h4 className="ds-title">{confidenceBreakdown.LOW} exploratory bets</h4>
                    <p className="ds-body">
                      Low-confidence rows tend to coincide with novel campaigns or sparse weather
                      history—treat as optional tests.
                    </p>
                  </div>
                </div>
              </section>
            </div>

            <aside className={styles.secondaryColumn}>
              <section className={styles.connectorSection}>
                <div className={styles.sectionHeader}>
                  <h3 className="ds-title">Connector tracker</h3>
                  <p className="ds-caption">
                    Keep ingestion healthy so WeatherOps can maintain Autopilot guardrails.
                  </p>
                </div>
                <OnboardingConnectorList
                  connectors={onboardingConnectors}
                  metaLabel={onboardingMeta}
                  loading={onboarding.loading}
                  isFallback={onboarding.isFallback}
                  errorMessage={onboardingErrorMessage}
                  className={styles.connectorList}
                />
                <div className={styles.personaPrompt}>
                  <h4>{personaPrompt.title}</h4>
                  <p>{personaPrompt.body}</p>
                  <Link
                    href={personaPrompt.href}
                    className={styles.personaCta}
                    data-analytics-id={personaPrompt.analyticsId}
                  >
                    {personaPrompt.ctaLabel} →
                  </Link>
                </div>
              </section>

              <section className={styles.activitySection} aria-label="Activity rail">
                <div className={styles.sectionHeader}>
                  <h3 className="ds-title">Activity rail</h3>
                  <p className="ds-caption">
                    Live feed of Autopilot pushes, approvals, and annotations.
                  </p>
                </div>
                <AutomationAuditList
                  audits={onboardingAudits}
                  loading={onboarding.loading}
                  isFallback={onboarding.isFallback}
                  errorMessage={onboardingErrorMessage}
                  limit={4}
                  className={styles.activityList}
                />
              </section>
            </aside>
          </div>
        )}

        {showPlanSections && (
          <section className={styles.contextLayout}>
            <ContextPanel tags={contextTags} warnings={contextWarnings} />
            <IncrementalityPanel
              design={plan?.incrementality_design ?? null}
              summary={plan?.incrementality_summary ?? null}
            />
            <div className={styles.contextMeta}>
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>Weather source</span>
                <span className={styles.metaValue}>{weatherSource}</span>
              </div>
              {Object.keys(datasetRows).length > 0 && (
                <dl className={styles.datasetStats}>
                  {Object.entries(datasetRows).map(([name, value]) => (
                    <div key={name}>
                      <dt>{name}</dt>
                      <dd>
                        {typeof value === "number" ? value.toLocaleString() : String(value ?? "—")}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </section>
        )}

        {showPlanSections && (
          <section className={styles.tableSection} id="plan-details">
            <details open className={styles.detailWrapper}>
              <summary className={styles.detailSummary}>
                Full allocation table
                <span className={styles.detailHint}>
                  Filter by geo, category, or confidence to inspect individual recommendations.
                </span>
              </summary>
              <div className={styles.tableWrap}>
                <table>
                  <caption className="sr-only">
                    Budget allocation recommendations for the next{" "}
                    {plan?.horizon_days ?? HORIZON_DAYS} days, including geography, category,
                    channel, spend, expected revenue, and confidence signals.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Geo Group</th>
                      <th scope="col">Category</th>
                      <th scope="col">Channel</th>
                      <th scope="col">Spend</th>
                      <th scope="col">Projected revenue (p50)</th>
                      <th scope="col">Projected ROAS (p50)</th>
                      <th scope="col">Confidence</th>
                      <th scope="col">Driver</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row) => (
                      <tr key={row.key}>
                        <td>{row.date}</td>
                        <td>{row.geo}</td>
                        <td>{row.category}</td>
                        <td>{row.channel}</td>
                        <td>{row.spend}</td>
                        <td>{row.revenueP50}</td>
                        <td>{row.roasP50}</td>
                        <td>
                          <span
                            className={`${styles.badge} ${styles[`confidence${row.confidence}`]}`}
                            aria-label={`Confidence ${row.confidence.toLowerCase()}`}
                          >
                            {row.confidence.toLowerCase()}
                          </span>
                        </td>
                        <td>{row.driver}</td>
                      </tr>
                    ))}
                    {!tableRows.length && (
                      <tr>
                        <td colSpan={9} className={styles.emptyState}>
                          <div className={styles.emptyStateWrap}>
                            <h4>Connect your systems to unlock live weather planning</h4>
                            <p>
                              Recommendations appear as soon as the ingestion run finishes. Track
                              connector progress and automation proof points below so the plan matches
                              what you saw in the demo tour.
                            </p>
                            <div className={styles.emptyPanels}>
                              <OnboardingConnectorList
                                connectors={onboardingConnectors}
                                metaLabel={onboardingMeta}
                                loading={onboarding.loading}
                                isFallback={onboarding.isFallback}
                                errorMessage={onboardingErrorMessage}
                                className={styles.emptyConnectorPanel}
                              />
                              <AutomationAuditList
                                audits={onboardingAudits}
                                loading={onboarding.loading}
                                isFallback={onboarding.isFallback}
                                errorMessage={onboardingErrorMessage}
                                limit={3}
                                className={styles.emptyAuditPanel}
                              />
                            </div>
                            <ul className={styles.emptyChecklist}>
                              <li>
                                <Link href="/setup" className={styles.emptyLink}>
                                  Use the setup bridge
                                </Link>{" "}
                                to connect Shopify, Meta, Google Ads, and Klaviyo credentials.
                              </li>
                              <li>Run the worker pipeline or schedule nightly automation</li>
                              <li>Return here as soon as the first run completes (we’ll email you)</li>
                            </ul>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        )}
      </div>
    </Layout>
  );
}
