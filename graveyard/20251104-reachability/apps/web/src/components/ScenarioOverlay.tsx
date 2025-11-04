import { useMemo } from "react";
import type { ScenarioOutcome, ScenarioChannelOutcome } from "../lib/scenario-builder";
import type { ConfidenceLevel } from "../types/plan";
import styles from "./scenario-overlay.module.css";

interface ScenarioOverlayProps {
  outcome: ScenarioOutcome;
  adjustments: { [channel: string]: number };
  showConfidenceBands?: boolean;
  showWeatherImpact?: boolean;
}

interface OverlayMetric {
  channel: string;
  confidence: ConfidenceLevel;
  impactScore: number;
  riskLevel: "low" | "medium" | "high";
  weatherSensitivity: number;
}

const CONFIDENCE_SCORE: Record<ConfidenceLevel, number> = {
  HIGH: 1,
  MEDIUM: 0.6,
  LOW: 0.3,
};

const CONFIDENCE_COLOR: Record<ConfidenceLevel, string> = {
  HIGH: "rgba(31, 195, 146, 0.24)",
  MEDIUM: "rgba(255, 184, 0, 0.24)",
  LOW: "rgba(255, 122, 122, 0.24)",
};

const CONFIDENCE_BORDER: Record<ConfidenceLevel, string> = {
  HIGH: "rgba(31, 195, 146, 0.48)",
  MEDIUM: "rgba(255, 184, 0, 0.48)",
  LOW: "rgba(255, 122, 122, 0.48)",
};

/**
 * Calculate weather sensitivity based on confidence and ROI delta
 */
const calculateWeatherSensitivity = (
  channel: ScenarioChannelOutcome,
  adjustment: number
): number => {
  const confidenceScore = CONFIDENCE_SCORE[channel.confidence];
  const roiDelta =
    channel.baseRoi && channel.scenarioRoi
      ? Math.abs(channel.scenarioRoi - channel.baseRoi) / Math.max(channel.baseRoi, 0.01)
      : 0;
  const adjustmentMagnitude = Math.abs(adjustment - 1);

  // Higher sensitivity for low confidence + significant ROI changes
  return (1 - confidenceScore) * roiDelta * (1 + adjustmentMagnitude);
};

/**
 * Calculate impact score (higher = more significant to scenario outcome)
 */
const calculateImpactScore = (channel: ScenarioChannelOutcome): number => {
  const spendWeight = Math.abs(channel.deltaSpend);
  const revenueWeight = Math.abs(channel.deltaRevenue);
  return spendWeight * 0.4 + revenueWeight * 0.6;
};

/**
 * Determine risk level based on confidence and delta magnitude
 */
const calculateRiskLevel = (
  channel: ScenarioChannelOutcome,
  adjustment: number
): "low" | "medium" | "high" => {
  const confidenceScore = CONFIDENCE_SCORE[channel.confidence];
  const adjustmentMagnitude = Math.abs(adjustment - 1);

  if (confidenceScore >= 0.9 && adjustmentMagnitude <= 0.15) {
    return "low";
  }
  if (confidenceScore >= 0.6 && adjustmentMagnitude <= 0.25) {
    return "medium";
  }
  return "high";
};

export function ScenarioOverlay({
  outcome,
  adjustments,
  showConfidenceBands = true,
  showWeatherImpact = true,
}: ScenarioOverlayProps) {
  const overlayMetrics = useMemo<OverlayMetric[]>(() => {
    return outcome.channels.map((channel) => {
      const adjustment = adjustments[channel.channel] ?? 1;
      return {
        channel: channel.channel,
        confidence: channel.confidence,
        impactScore: calculateImpactScore(channel),
        riskLevel: calculateRiskLevel(channel, adjustment),
        weatherSensitivity: calculateWeatherSensitivity(channel, adjustment),
      };
    });
  }, [outcome.channels, adjustments]);

  const maxImpact = useMemo(
    () => Math.max(...overlayMetrics.map((m) => m.impactScore), 1),
    [overlayMetrics]
  );

  const maxSensitivity = useMemo(
    () => Math.max(...overlayMetrics.map((m) => m.weatherSensitivity), 0.1),
    [overlayMetrics]
  );

  return (
    <div className={styles.overlayContainer} role="region" aria-label="Scenario overlay analysis">
      <header className={styles.overlayHeader}>
        <h3 className="ds-subtitle">Scenario overlay analysis</h3>
        <p className="ds-caption">
          Visual indicators show confidence levels, weather sensitivity, and impact magnitude for each
          channel adjustment.
        </p>
      </header>

      {showConfidenceBands && (
        <section className={styles.confidenceBands} aria-labelledby="confidence-legend">
          <h4 id="confidence-legend" className="ds-caption" style={{ fontWeight: 600 }}>
            Confidence bands
          </h4>
          <div className={styles.bandGrid}>
            {overlayMetrics.map((metric) => (
              <div
                key={`confidence-${metric.channel}`}
                className={styles.bandItem}
                style={{
                  backgroundColor: CONFIDENCE_COLOR[metric.confidence],
                  borderLeft: `4px solid ${CONFIDENCE_BORDER[metric.confidence]}`,
                }}
              >
                <span className="ds-body-strong">{metric.channel}</span>
                <div className={styles.bandMeta}>
                  <span
                    className={`${styles.confidencePill} ${styles[`confidence${metric.confidence}`]}`}
                  >
                    {metric.confidence}
                  </span>
                  <span className="ds-caption">{metric.riskLevel} risk</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {showWeatherImpact && (
        <section className={styles.weatherImpact} aria-labelledby="weather-impact-legend">
          <h4 id="weather-impact-legend" className="ds-caption" style={{ fontWeight: 600 }}>
            Weather sensitivity indicators
          </h4>
          <p className="ds-caption" style={{ opacity: 0.72, marginTop: "0.5rem" }}>
            Wider bars indicate higher weather exposure. Low-confidence channels with large adjustments
            show elevated sensitivity.
          </p>
          <div className={styles.impactBars}>
            {overlayMetrics
              .sort((a, b) => b.weatherSensitivity - a.weatherSensitivity)
              .map((metric) => {
                const sensitivityPct = (metric.weatherSensitivity / maxSensitivity) * 100;
                return (
                  <div key={`impact-${metric.channel}`} className={styles.impactRow}>
                    <span className="ds-body" style={{ minWidth: "140px" }}>
                      {metric.channel}
                    </span>
                    <div className={styles.barContainer}>
                      <div
                        className={styles.impactBar}
                        style={{
                          width: `${Math.max(sensitivityPct, 2)}%`,
                          backgroundColor:
                            metric.weatherSensitivity > maxSensitivity * 0.6
                              ? "rgba(255, 122, 122, 0.48)"
                              : metric.weatherSensitivity > maxSensitivity * 0.3
                                ? "rgba(255, 184, 0, 0.48)"
                                : "rgba(31, 195, 146, 0.48)",
                        }}
                        aria-label={`${metric.channel} weather sensitivity: ${sensitivityPct.toFixed(0)}%`}
                      />
                    </div>
                    <span className="ds-caption" style={{ minWidth: "50px", textAlign: "right" }}>
                      {sensitivityPct.toFixed(0)}%
                    </span>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      <section className={styles.impactChart} aria-labelledby="impact-chart-legend">
        <h4 id="impact-chart-legend" className="ds-caption" style={{ fontWeight: 600 }}>
          Impact magnitude
        </h4>
        <p className="ds-caption" style={{ opacity: 0.72, marginTop: "0.5rem" }}>
          Channels with larger deltas (spend + revenue weighted) have greater influence on overall
          scenario outcomes.
        </p>
        <div className={styles.impactBars}>
          {overlayMetrics
            .sort((a, b) => b.impactScore - a.impactScore)
            .map((metric) => {
              const impactPct = (metric.impactScore / maxImpact) * 100;
              return (
                <div key={`magnitude-${metric.channel}`} className={styles.impactRow}>
                  <span className="ds-body" style={{ minWidth: "140px" }}>
                    {metric.channel}
                  </span>
                  <div className={styles.barContainer}>
                    <div
                      className={styles.impactBar}
                      style={{
                        width: `${Math.max(impactPct, 2)}%`,
                        backgroundColor: "rgba(81, 120, 255, 0.48)",
                      }}
                      aria-label={`${metric.channel} impact: ${impactPct.toFixed(0)}%`}
                    />
                  </div>
                  <span className="ds-caption" style={{ minWidth: "50px", textAlign: "right" }}>
                    {impactPct.toFixed(0)}%
                  </span>
                </div>
              );
            })}
        </div>
      </section>
    </div>
  );
}
