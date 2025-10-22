import { useCallback, useState } from "react";

import {
  buildPlanCsv,
  buildPlanExportFilename,
  buildPlanWithExperimentsCsv,
  buildExperimentsExportFilename,
} from "../lib/plan-export";
import type { PlanResponse } from "../types/plan";

interface PlanDownloadButtonProps {
  plan: PlanResponse | null;
  tenantId: string;
  className?: string;
  analyticsId?: string;
  onDownload?: (csv: string, filename: string) => void;
}

const triggerBrowserDownload = (csv: string, filename: string) => {
  if (typeof window === "undefined") {
    return;
  }
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

export function PlanDownloadButton({
  plan,
  tenantId,
  className,
  analyticsId = "plan.banner.download",
  onDownload,
}: PlanDownloadButtonProps) {
  const [showMenu, setShowMenu] = useState(false);

  const handleDownloadPlan = useCallback(() => {
    if (!plan || !plan.slices.length) {
      return;
    }
    const csv = buildPlanCsv(plan);
    const filename = buildPlanExportFilename(tenantId, plan.generated_at);
    if (onDownload) {
      onDownload(csv, filename);
    } else {
      triggerBrowserDownload(csv, filename);
    }
    setShowMenu(false);
  }, [plan, tenantId, onDownload]);

  const handleDownloadWithExperiments = useCallback(() => {
    if (!plan || !plan.slices.length) {
      return;
    }
    const csv = buildPlanWithExperimentsCsv(plan);
    const filename = buildPlanExportFilename(tenantId, plan.generated_at);
    if (onDownload) {
      onDownload(csv, filename);
    } else {
      triggerBrowserDownload(csv, filename);
    }
    setShowMenu(false);
  }, [plan, tenantId, onDownload]);

  const handleDownloadExperiments = useCallback(() => {
    if (!plan || !plan.experiments || plan.experiments.length === 0) {
      return;
    }
    const filename = buildExperimentsExportFilename(tenantId, plan.generated_at);
    const csv = `experiment_id,status,metric_name,lift_pct,absolute_lift,confidence_low,confidence_high,p_value,is_significant,sample_size,generated_at\n${plan.experiments
      .map((exp) => {
        const lift = exp.lift;
        const fields = [
          exp.experiment_id,
          exp.status,
          exp.metric_name,
          lift ? (lift.lift_pct * 100).toFixed(2) : "",
          lift ? lift.absolute_lift.toFixed(2) : "",
          lift ? (lift.confidence_low * 100).toFixed(2) : "",
          lift ? (lift.confidence_high * 100).toFixed(2) : "",
          lift ? lift.p_value.toFixed(4) : "",
          lift ? (lift.is_significant ? "true" : "false") : "",
          lift ? lift.sample_size : "",
          lift?.generated_at ?? "",
        ];
        return fields.map((f) => (f && typeof f === "string" && /[",\n]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f)).join(",");
      })
      .join("\n")}`;
    if (onDownload) {
      onDownload(csv, filename);
    } else {
      triggerBrowserDownload(csv, filename);
    }
    setShowMenu(false);
  }, [plan, tenantId, onDownload]);

  const disabled = !plan || plan.slices.length === 0;
  const hasExperiments = plan && plan.experiments && plan.experiments.length > 0;

  if (!hasExperiments) {
    return (
      <button
        type="button"
        onClick={handleDownloadPlan}
        className={className}
        data-analytics-id={analyticsId}
        disabled={disabled}
      >
        Export plan CSV
      </button>
    );
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setShowMenu(!showMenu)}
        className={className}
        data-analytics-id={analyticsId}
        disabled={disabled}
      >
        Export plan & experiments →
      </button>
      {showMenu && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: "0.5rem",
            minWidth: "200px",
            backgroundColor: "var(--ds-surface-default)",
            border: "1px solid var(--ds-border-subtle)",
            borderRadius: "0.375rem",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 10,
          }}
        >
          <button
            type="button"
            onClick={handleDownloadPlan}
            style={{
              display: "block",
              width: "100%",
              padding: "0.75rem 1rem",
              textAlign: "left",
              border: "none",
              backgroundColor: "transparent",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
            data-analytics-id={`${analyticsId}.plan`}
          >
            Plan only
          </button>
          <button
            type="button"
            onClick={handleDownloadWithExperiments}
            style={{
              display: "block",
              width: "100%",
              padding: "0.75rem 1rem",
              textAlign: "left",
              border: "none",
              backgroundColor: "transparent",
              cursor: "pointer",
              fontSize: "0.875rem",
              borderTop: "1px solid var(--ds-border-subtle)",
            }}
            data-analytics-id={`${analyticsId}.combined`}
          >
            Plan with experiments
          </button>
          <button
            type="button"
            onClick={handleDownloadExperiments}
            style={{
              display: "block",
              width: "100%",
              padding: "0.75rem 1rem",
              textAlign: "left",
              border: "none",
              backgroundColor: "transparent",
              cursor: "pointer",
              fontSize: "0.875rem",
              borderTop: "1px solid var(--ds-border-subtle)",
            }}
            data-analytics-id={`${analyticsId}.experiments`}
          >
            Experiments only
          </button>
        </div>
      )}
    </div>
  );
}
