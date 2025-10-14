import type { BacktestPoint } from "../types/incrementality";
import styles from "../styles/plan.module.css";

interface BacktestChartProps {
  points: BacktestPoint[];
  title?: string;
}

const CHART_WIDTH = 520;
const CHART_HEIGHT = 200;
const MARGIN_X = 36;
const MARGIN_Y = 20;

export function BacktestChart({ points, title }: BacktestChartProps) {
  if (!points || points.length < 2) {
    return (
      <div className={styles.chartCard}>
        <h3 className="ds-title">{title ?? "Backtest timeline"}</h3>
        <p className={`${styles.chartEmpty} ds-body`}>
          Backtest data will appear once at least two performance snapshots are stored.
        </p>
      </div>
    );
  }

  const actualSeries = points.map((point) => point.actual);
  const predictedSeries = points.map((point) => point.predicted);
  const cumulativeSeries = points
    .map((point) => point.cumulative_lift ?? null)
    .filter((value): value is number => value !== null && value !== undefined);

  const allValues = [...actualSeries, ...predictedSeries];
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  const valueRange = maxValue - minValue || 1;

  const scaleX = (index: number) => {
    if (points.length === 1) {
      return MARGIN_X + (CHART_WIDTH - MARGIN_X * 2) / 2;
    }
    const fraction = index / (points.length - 1);
    return MARGIN_X + fraction * (CHART_WIDTH - MARGIN_X * 2);
  };

  const scaleY = (value: number) => {
    const fraction = (value - minValue) / valueRange;
    return CHART_HEIGHT - MARGIN_Y - fraction * (CHART_HEIGHT - MARGIN_Y * 2);
  };

  const cumulativeExtents =
    cumulativeSeries.length > 0
      ? {
          min: Math.min(...cumulativeSeries),
          max: Math.max(...cumulativeSeries),
        }
      : { min: 0, max: 0 };

  const cumulativeRange = cumulativeExtents.max - cumulativeExtents.min || 1;
  const scaleCumulative = (value: number) => {
    const fraction = (value - cumulativeExtents.min) / cumulativeRange;
    return CHART_HEIGHT - MARGIN_Y - fraction * (CHART_HEIGHT - MARGIN_Y * 2);
  };

  const buildPath = (values: number[], yScale: (value: number) => number) =>
    values
      .map((value, index) => {
        const x = scaleX(index);
        const y = yScale(value);
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");

  const actualPath = buildPath(actualSeries, scaleY);
  const predictedPath = buildPath(predictedSeries, scaleY);

  const cumulativePath =
    cumulativeSeries.length > 0
      ? buildPath(
          points.map((point) => point.cumulative_lift ?? cumulativeExtents.min),
          scaleCumulative,
        )
      : null;

  const latestPoint = points[points.length - 1];
  const latestTimestamp = latestPoint.timestamp
    ? new Date(latestPoint.timestamp).toLocaleString()
    : "—";

  const latestLiftPct =
    typeof latestPoint.cumulative_lift_pct === "number"
      ? `${(latestPoint.cumulative_lift_pct * 100).toFixed(1)}%`
      : latestPoint.cumulative_lift_pct ?? latestPoint.lift
        ? `${(latestPoint.lift * 100).toFixed(1)}%`
        : "—";

  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHeader}>
        <h3 className="ds-title">{title ?? "Backtest timeline"}</h3>
        <div className={`${styles.chartMeta} ds-caption`}>
          <span>
            Last updated: <strong className="ds-body-strong">{latestTimestamp}</strong>
          </span>
          <span>
            Cumulative lift: <strong className="ds-body-strong">{latestLiftPct}</strong>
          </span>
        </div>
      </div>
      <div className={`${styles.chartLegend} ds-caption`}>
        <span className={styles.legendActual}>Actual observed</span>
        <span className={styles.legendPredicted}>Predicted p50</span>
        {cumulativePath && <span className={styles.legendCumulative}>Cumulative lift</span>}
      </div>
      <svg
        className={styles.chartSvg}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label="Backtest chart showing actual vs predicted values over time"
      >
        <g>
          <line
            x1={MARGIN_X}
            x2={CHART_WIDTH - MARGIN_X}
            y1={CHART_HEIGHT - MARGIN_Y}
            y2={CHART_HEIGHT - MARGIN_Y}
            className={styles.chartAxis}
          />
          <line
            x1={MARGIN_X}
            x2={MARGIN_X}
            y1={MARGIN_Y}
            y2={CHART_HEIGHT - MARGIN_Y}
            className={styles.chartAxis}
          />
        </g>
        {cumulativePath && (
          <path d={cumulativePath} className={styles.chartCumulative} fill="none" vectorEffect="non-scaling-stroke" />
        )}
        <path d={actualPath} className={styles.chartActual} fill="none" vectorEffect="non-scaling-stroke" />
        <path d={predictedPath} className={styles.chartPredicted} fill="none" vectorEffect="non-scaling-stroke" />
        <circle
          cx={scaleX(points.length - 1)}
          cy={scaleY(latestPoint.actual)}
          r={4}
          className={styles.chartActualMarker}
        />
        <circle
          cx={scaleX(points.length - 1)}
          cy={scaleY(latestPoint.predicted)}
          r={4}
          className={styles.chartPredictedMarker}
        />
      </svg>
      <div className={`${styles.chartFootnote} ds-caption`}>
        Daily points plot actual performance versus the model’s median forecast. Cumulative lift tracks the running
        delta between predicted and actual outcomes.
      </div>
    </div>
  );
}
