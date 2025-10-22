import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";

import { Layout } from "../components/Layout";
import { ScenarioOverlay } from "../components/ScenarioOverlay";
import { ScenarioExportButton } from "../components/ScenarioExportButton";
import { SaveScenarioModal } from "../components/SaveScenarioModal";
import { LoadScenarioPanel } from "../components/LoadScenarioPanel";
import {
  fetchPlan,
  fetchScenarioRecommendations,
  createScenarioSnapshot,
  fetchScenarioSnapshots,
  deleteScenarioSnapshot,
  type ScenarioSnapshot,
} from "../lib/api";
import { buildDemoPlan } from "../demo/plan";
import styles from "../styles/scenarios.module.css";
import {
  applyScenarioAdjustments,
  buildScenarioBaseline,
  deriveScenarioRecommendations,
  type ScenarioAdjustmentMap,
  type ScenarioBaseline,
} from "../lib/scenario-builder";
import type { PlanResponse } from "../types/plan";
import type { ScenarioRecommendation } from "../types/scenario";

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-tenant";
const HORIZON_DAYS = Number(process.env.NEXT_PUBLIC_PLAN_HORIZON ?? "7");
const MIN_PERCENT = 70;
const MAX_PERCENT = 130;

function formatCurrency(amount: number | null | undefined): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return "—";
  }
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(amount) >= 1000 ? 0 : 2,
  });
  return formatter.format(amount);
}

function formatPercent(multiplier: number): string {
  if (!Number.isFinite(multiplier)) {
    return "0%";
  }
  const deltaPct = (multiplier - 1) * 100;
  const rounded = Math.round(deltaPct);
  if (rounded === 0) {
    return "0%";
  }
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function formatRoi(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "—";
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)}x`;
}

function confidenceLabel(value: string): string {
  switch (value) {
    case "HIGH":
      return "High confidence";
    case "MEDIUM":
      return "Moderate confidence";
    case "LOW":
    default:
      return "Low confidence";
  }
}

function multiplierToSlider(multiplier: number): number {
  const percent = Math.round(multiplier * 100);
  if (!Number.isFinite(percent)) {
    return 100;
  }
  return Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, percent));
}

function sliderToMultiplier(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return value / 100;
}

export default function ScenarioBuilderPage() {
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [baseline, setBaseline] = useState<ScenarioBaseline | null>(null);
  const [adjustments, setAdjustments] = useState<ScenarioAdjustmentMap>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState<boolean>(false);
  const [recommendations, setRecommendations] = useState<ScenarioRecommendation[]>([]);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [activeRecommendationId, setActiveRecommendationId] = useState<string | null>(null);

  // Save/Load state
  const [saveModalOpen, setSaveModalOpen] = useState<boolean>(false);
  const [snapshots, setSnapshots] = useState<ScenarioSnapshot[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState<boolean>(false);
  const [snapshotsError, setSnapshotsError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const response = await fetchPlan(TENANT_ID, HORIZON_DAYS);
        if (cancelled) {
          return;
        }
        setPlan(response);
        setUsingFallback(false);
      } catch (caught) {
        if (cancelled) {
          return;
        }
        const fallbackPlan = buildDemoPlan();
        setPlan(fallbackPlan);
        setError(
          caught instanceof Error
            ? caught.message
            : "Failed to load live plan data. Showing demo scenario instead.",
        );
        setUsingFallback(true);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!plan) {
      setBaseline(null);
      setAdjustments({});
      return;
    }
    const nextBaseline = buildScenarioBaseline(plan);
    setBaseline(nextBaseline);
    const defaultAdjustments: ScenarioAdjustmentMap = {};
    nextBaseline.channels.forEach((channel) => {
      defaultAdjustments[channel.channel] = 1;
    });
    setAdjustments(defaultAdjustments);
    setRecommendations([]);
    setRecommendationError(null);
    setActiveRecommendationId(null);
  }, [plan]);

  useEffect(() => {
    if (!baseline) {
      setRecommendations([]);
      setRecommendationError(null);
      return;
    }

    let cancelled = false;
    async function loadRecommendations() {
      try {
        if (usingFallback) {
          const fallback = deriveScenarioRecommendations(baseline);
          if (!cancelled) {
            setRecommendations(fallback);
            setRecommendationError(
              fallback.length === 0 ? "No scenario recommendations available for the current plan." : null,
            );
          }
          return;
        }
        const payload = await fetchScenarioRecommendations(TENANT_ID, HORIZON_DAYS);
        if (cancelled) {
          return;
        }
        const recs = payload.recommendations.length
          ? payload.recommendations
          : deriveScenarioRecommendations(baseline);
        setRecommendations(recs);
        setRecommendationError(
          recs.length === 0 ? "Scenario recommendations unavailable for the current telemetry." : null,
        );
      } catch (caught) {
        if (cancelled) {
          return;
        }
        const fallback = deriveScenarioRecommendations(baseline);
        setRecommendations(fallback);
        const message =
          caught instanceof Error ? caught.message : "Unable to load scenario recommendations.";
        setRecommendationError(
          fallback.length
            ? `${message} Using locally generated scenario mix.`
            : `${message} Scenario recommendations unavailable.`,
        );
      }
    }

    void loadRecommendations();
    return () => {
      cancelled = true;
    };
  }, [baseline, usingFallback]);

  // Load saved snapshots
  useEffect(() => {
    let cancelled = false;
    async function loadSnapshots() {
      setSnapshotsLoading(true);
      setSnapshotsError(null);
      try {
        const response = await fetchScenarioSnapshots(TENANT_ID);
        if (!cancelled) {
          setSnapshots(response.snapshots);
        }
      } catch (caught) {
        if (!cancelled) {
          const message =
            caught instanceof Error ? caught.message : "Failed to load saved scenarios.";
          setSnapshotsError(message);
        }
      } finally {
        if (!cancelled) {
          setSnapshotsLoading(false);
        }
      }
    }

    void loadSnapshots();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveScenario = async (name: string, description: string, tags: string[]) => {
    if (!baseline) {
      return;
    }
    setIsSaving(true);
    try {
      const snapshot = await createScenarioSnapshot(
        TENANT_ID,
        name,
        adjustments,
        HORIZON_DAYS,
        description,
        tags,
      );
      setSnapshots((prev) => [snapshot, ...prev]);
      setSaveModalOpen(false);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Failed to save scenario.";
      alert(`Error saving scenario: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadScenario = (snapshot: ScenarioSnapshot) => {
    setAdjustments(snapshot.adjustments);
    setActiveRecommendationId(null);
  };

  const handleDeleteSnapshot = async (snapshotId: string) => {
    if (!confirm("Delete this saved scenario?")) {
      return;
    }
    try {
      await deleteScenarioSnapshot(TENANT_ID, snapshotId);
      setSnapshots((prev) => prev.filter((s) => s.id !== snapshotId));
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Failed to delete scenario.";
      alert(`Error deleting scenario: ${message}`);
    }
  };

  const outcome = useMemo(
    () => (baseline ? applyScenarioAdjustments(baseline, adjustments) : null),
    [baseline, adjustments],
  );

  const summary = useMemo(() => outcome?.summary ?? null, [outcome]);

  const totalDeltaSpend = summary ? summary.deltaSpend : 0;
  const totalDeltaRevenue = summary ? summary.deltaRevenue : 0;

  const handleAdjustmentChange = (channel: string, sliderValue: number) => {
    const multiplier = sliderToMultiplier(sliderValue);
    setAdjustments((prev) => {
      const next = { ...prev, [channel]: multiplier };
      return next;
    });
    setActiveRecommendationId(null);
  };

  const handleReset = () => {
    if (!baseline) {
      return;
    }
    const defaults: ScenarioAdjustmentMap = {};
    baseline.channels.forEach((channel) => {
      defaults[channel.channel] = 1;
    });
    setAdjustments(defaults);
    setActiveRecommendationId(null);
  };

  const handleApplyRecommendation = (recommendation: ScenarioRecommendation) => {
    if (!baseline) {
      return;
    }
    const next: ScenarioAdjustmentMap = {};
    baseline.channels.forEach((channel) => {
      const match = recommendation.adjustments.find((adjustment) => adjustment.channel === channel.channel);
      next[channel.channel] = match ? match.multiplier : 1;
    });
    setAdjustments(next);
    setActiveRecommendationId(recommendation.id);
  };

  return (
    <Layout>
      <Head>
        <title>WeatherVane · Scenario builder</title>
      </Head>
      <div className={styles.root}>
        <section className={`${styles.hero} ds-surface-glass`}>
          <div className={styles.heroHeader}>
            <div>
              <h1 className="ds-title">Scenario builder</h1>
              <p className="ds-body">
                Adjust channel exposure to explore weather-driven “what if” cases. Use this to brief
                Priya and Sarah on projected spend, revenue, and confidence before approving plan changes.
              </p>
            </div>
            <div className={styles.heroActions}>
              {outcome && (
                <ScenarioExportButton
                  outcome={outcome}
                  recommendations={recommendations}
                  adjustments={adjustments}
                  tenantId={TENANT_ID}
                  horizonDays={HORIZON_DAYS}
                  className={styles.exportButton}
                />
              )}
              <button
                type="button"
                onClick={() => setSaveModalOpen(true)}
                className={styles.saveButton}
              >
                Save scenario
              </button>
              <button type="button" onClick={handleReset} className={styles.resetButton}>
                Reset adjustments
              </button>
              <Link href="/plan" className={styles.planLink}>
                Back to plan
              </Link>
            </div>
          </div>
          {usingFallback && (
            <p className={`${styles.fallbackNotice} ds-caption`} role="status">
              Showing demo plan baseline. {error ?? "Live plan data unavailable; using seeded telemetry."}
            </p>
          )}
          {loading && (
            <p className="ds-body" role="status">
              Loading latest plan…
            </p>
          )}
          {summary && (
            <div className={styles.summaryGrid} aria-live="polite">
              {(() => {
                const spendMultiplier =
                  summary.totalBaseSpend > 0
                    ? summary.totalScenarioSpend / summary.totalBaseSpend
                    : 1;
                const revenueMultiplier =
                  summary.totalBaseRevenue > 0
                    ? summary.totalScenarioRevenue / summary.totalBaseRevenue
                    : 1;
                return (
                  <>
                    <article className={styles.summaryCard}>
                      <span className="ds-caption">Base spend</span>
                      <strong className="ds-display-small">
                        {formatCurrency(summary.totalBaseSpend)}
                      </strong>
                    </article>
                    <article className={styles.summaryCard}>
                      <span className="ds-caption">Scenario spend</span>
                      <strong className="ds-display-small">
                        {formatCurrency(summary.totalScenarioSpend)}
                      </strong>
                      <span
                        className={`${styles.deltaBadge} ${
                          totalDeltaSpend >= 0 ? styles.deltaPositive : styles.deltaNegative
                        }`}
                      >
                        {formatCurrency(totalDeltaSpend)} ({formatPercent(spendMultiplier)})
                      </span>
                    </article>
                    <article className={styles.summaryCard}>
                      <span className="ds-caption">Base revenue (p50)</span>
                      <strong className="ds-display-small">
                        {formatCurrency(summary.totalBaseRevenue)}
                      </strong>
                    </article>
                    <article className={styles.summaryCard}>
                      <span className="ds-caption">Scenario revenue (p50)</span>
                      <strong className="ds-display-small">
                        {formatCurrency(summary.totalScenarioRevenue)}
                      </strong>
                      <span
                        className={`${styles.deltaBadge} ${
                          totalDeltaRevenue >= 0 ? styles.deltaPositive : styles.deltaNegative
                        }`}
                      >
                        {formatCurrency(totalDeltaRevenue)} ({formatPercent(revenueMultiplier)})
                      </span>
                    </article>
                    <article className={styles.summaryCard}>
                      <span className="ds-caption">Scenario ROI</span>
                      <strong className="ds-display-small">
                        {formatRoi(summary.scenarioRoi)}
                      </strong>
                      <span className={`${styles.confidenceBadge} ds-caption`}>
                        {confidenceLabel(summary.weightedConfidence)}
                      </span>
                    </article>
                  </>
                );
              })()}
            </div>
          )}
        </section>

        <section className={`${styles.recommendations} ds-surface`}>
          <header className={styles.recommendationsHeader}>
            <div>
              <h2 className="ds-title">Recommended scenarios</h2>
              <p className="ds-body">
                Atlas surfaces mixes balancing ROI with weather confidence. Apply a recommendation to pre-fill
                sliders, then fine-tune channel weights before sharing with stakeholders.
              </p>
            </div>
          </header>
          {recommendationError && (
            <p className={`${styles.recommendationsNotice} ds-caption`} role="status">
              {recommendationError}
            </p>
          )}
          {!recommendationError && recommendations.length === 0 && (
            <p className="ds-body" role="status">
              Scenario recommendations will appear once telemetry contains sufficient coverage.
            </p>
          )}
          <div className={styles.recommendationGrid}>
            {recommendations.map((recommendation) => {
              const isActive = recommendation.id === activeRecommendationId;
              return (
                <article
                  key={recommendation.id}
                  className={`${styles.recommendationCard} ${
                    isActive ? styles.recommendationCardActive : ""
                  }`}
                >
                  <header className={styles.recommendationCardHeader}>
                    <div>
                      <h3 className="ds-subtitle">{recommendation.label}</h3>
                      <p className="ds-caption">{recommendation.description}</p>
                    </div>
                    <div className={styles.recommendationTags} role="list">
                      {recommendation.tags.map((tag) => (
                        <span key={tag} role="listitem" className={styles.recommendationTag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </header>
                  <dl className={styles.recommendationAdjustments}>
                    {recommendation.adjustments.map((adjustment) => (
                      <div key={`${recommendation.id}-${adjustment.channel}`} className={styles.adjustmentRow}>
                        <dt>{adjustment.channel}</dt>
                        <dd>
                          <span className={styles.adjustmentMultiplier}>
                            {formatPercent(adjustment.multiplier)}
                          </span>
                          <span className={styles.adjustmentRationale}>{adjustment.rationale}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <button
                    type="button"
                    onClick={() => handleApplyRecommendation(recommendation)}
                    className={styles.applyRecommendationButton}
                    aria-pressed={isActive}
                  >
                    {isActive ? "Applied" : "Apply scenario"}
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <section className={`${styles.controls} ds-surface-glass`}>
          <header>
            <h2 className="ds-title">Channel adjustments</h2>
            <p className="ds-body">
              Set the expected demand shift for each channel. Sliders scale recommended spend, while revenue is
              adjusted using confidence-weighted lift assumptions.
            </p>
          </header>
          {!baseline && !loading && (
            <p className="ds-body" role="status">
              Scenario baseline unavailable. Refresh to retry.
            </p>
          )}
          {baseline?.channels.map((channel) => {
            const multiplier = adjustments[channel.channel] ?? 1;
            const sliderValue = multiplierToSlider(multiplier);
            const scenarioChannel = outcome?.channels.find(
              (item) => item.channel === channel.channel,
            );
            return (
              <div key={channel.channel} className={styles.controlRow}>
                <div className={styles.controlHeader}>
                  <strong className="ds-body-strong">{channel.channel}</strong>
                  <span className="ds-caption">{confidenceLabel(channel.confidence)}</span>
                </div>
                <div className={styles.sliderRow}>
                  <label htmlFor={`scenario-${channel.channel}`} className="ds-caption">
                    Demand shift
                  </label>
                  <input
                    id={`scenario-${channel.channel}`}
                    type="range"
                    min={MIN_PERCENT}
                    max={MAX_PERCENT}
                    step={1}
                    value={sliderValue}
                    onChange={(event) =>
                      handleAdjustmentChange(channel.channel, Number(event.target.value))
                    }
                    className={styles.slider}
                    aria-valuetext={formatPercent(multiplier)}
                  />
                  <span className="ds-body-strong">{formatPercent(multiplier)}</span>
                </div>
                <dl className={styles.channelStats}>
                  <div>
                    <dt className="ds-caption">Base spend</dt>
                    <dd className="ds-body-strong">{formatCurrency(channel.spend)}</dd>
                  </div>
                  <div>
                    <dt className="ds-caption">Scenario spend</dt>
                    <dd className="ds-body-strong">
                      {formatCurrency(scenarioChannel?.scenarioSpend ?? channel.spend * multiplier)}
                    </dd>
                  </div>
                  <div>
                    <dt className="ds-caption">Base ROI</dt>
                    <dd className="ds-body-strong">
                      {formatRoi(channel.baseRoi)}
                    </dd>
                  </div>
                  <div>
                    <dt className="ds-caption">Scenario ROI</dt>
                    <dd className="ds-body-strong">
                      {formatRoi(scenarioChannel?.scenarioRoi)}
                    </dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </section>

        {outcome && (
          <section className={`${styles.outcome} ds-surface-card`}>
            <header className={styles.outcomeHeader}>
              <h2 className="ds-title">Scenario impact</h2>
              <p className="ds-body">
                Review aggregate deltas by channel before exporting or sharing this outlook.
              </p>
            </header>
            <div className={styles.outcomeTable} role="table" aria-label="Scenario channel impact">
              <div className={`${styles.tableRow} ${styles.tableHead}`} role="row">
                <span role="columnheader">Channel</span>
                <span role="columnheader">Δ Spend</span>
                <span role="columnheader">Δ Revenue</span>
                <span role="columnheader">Scenario ROI</span>
              </div>
              {outcome.channels.map((channel) => (
                <div key={`outcome-${channel.channel}`} className={styles.tableRow} role="row">
                  <span className="ds-body-strong" role="cell">
                    {channel.channel}
                  </span>
                  <span
                    role="cell"
                    className={channel.deltaSpend >= 0 ? styles.deltaPositive : styles.deltaNegative}
                  >
                    {formatCurrency(channel.deltaSpend)}
                  </span>
                  <span
                    role="cell"
                    className={channel.deltaRevenue >= 0 ? styles.deltaPositive : styles.deltaNegative}
                  >
                    {formatCurrency(channel.deltaRevenue)}
                  </span>
                  <span role="cell">
                    {channel.scenarioRoi ? `${channel.scenarioRoi.toFixed(2)}x` : "—"}
                  </span>
                </div>
              ))}
            </div>
            <footer className={styles.outcomeFooter}>
              <p className="ds-body">
                Once aligned with stakeholders, record the decision in Stories and approve updated plan
                cards. The consensus engine will capture this scenario as supporting evidence.
              </p>
              <Link href="/stories?source=scenarios" className={styles.storyLink}>
                Capture scenario in Stories →
              </Link>
            </footer>
          </section>
        )}

        {outcome && (
          <ScenarioOverlay
            outcome={outcome}
            adjustments={adjustments}
            showConfidenceBands={true}
            showWeatherImpact={true}
          />
        )}

        <section className={`${styles.savedScenarios} ds-surface`}>
          <header>
            <h2 className="ds-title">Saved scenarios</h2>
            <p className="ds-body">
              Load a previous scenario to compare or iterate on earlier analyses.
            </p>
          </header>
          {snapshotsError && (
            <p className={`${styles.snapshotsError} ds-caption`} role="status">
              {snapshotsError}
            </p>
          )}
          <LoadScenarioPanel
            snapshots={snapshots}
            onLoad={handleLoadScenario}
            onDelete={handleDeleteSnapshot}
            loading={snapshotsLoading}
          />
        </section>
      </div>

      <SaveScenarioModal
        isOpen={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        onSave={handleSaveScenario}
        isSaving={isSaving}
      />
    </Layout>
  );
}
