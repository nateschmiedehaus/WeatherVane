import { useCallback, useState } from "react";

import {
  buildCompleteScenarioCsv,
  buildScenarioExportFilename,
  buildPowerPointData,
  exportPowerPointJson,
} from "../lib/scenario-export";
import type { ScenarioOutcome } from "../lib/scenario-builder";
import type { ScenarioRecommendation } from "../types/scenario";

interface ScenarioExportButtonProps {
  outcome: ScenarioOutcome | null;
  recommendations: ScenarioRecommendation[];
  adjustments: { [channel: string]: number };
  tenantId: string;
  horizonDays: number;
  className?: string;
  analyticsId?: string;
  onExport?: (data: string, filename: string, format: "csv" | "pptx") => void;
}

const triggerBrowserDownload = (data: string, filename: string, mimeType: string) => {
  if (typeof window === "undefined") {
    return;
  }
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

export function ScenarioExportButton({
  outcome,
  recommendations,
  adjustments,
  tenantId,
  horizonDays,
  className,
  analyticsId = "scenario.export",
  onExport,
}: ScenarioExportButtonProps) {
  const [showMenu, setShowMenu] = useState(false);

  const handleExportCsv = useCallback(() => {
    if (!outcome) {
      return;
    }
    const csv = buildCompleteScenarioCsv(
      outcome,
      recommendations,
      adjustments,
      tenantId,
      horizonDays
    );
    const filename = buildScenarioExportFilename(tenantId, "csv");

    if (onExport) {
      onExport(csv, filename, "csv");
    } else {
      triggerBrowserDownload(csv, filename, "text/csv;charset=utf-8;");
    }
    setShowMenu(false);
  }, [outcome, recommendations, adjustments, tenantId, horizonDays, onExport]);

  const handleExportPowerPoint = useCallback(() => {
    if (!outcome) {
      return;
    }
    const slides = buildPowerPointData(
      outcome,
      recommendations,
      adjustments,
      tenantId,
      horizonDays
    );
    const json = exportPowerPointJson(slides);
    const filename = buildScenarioExportFilename(tenantId, "pptx");

    if (onExport) {
      onExport(json, filename, "pptx");
    } else {
      triggerBrowserDownload(json, filename, "application/json;charset=utf-8;");
    }
    setShowMenu(false);
  }, [outcome, recommendations, adjustments, tenantId, horizonDays, onExport]);

  const disabled = !outcome;

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setShowMenu(!showMenu)}
        className={className}
        data-analytics-id={analyticsId}
        disabled={disabled}
        aria-label="Export scenario analysis"
        aria-expanded={showMenu}
        aria-haspopup="true"
      >
        Export scenario →
      </button>
      {showMenu && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: "0.5rem",
            minWidth: "220px",
            backgroundColor: "var(--ds-surface-default, rgba(20, 20, 24, 0.96))",
            border: "1px solid var(--ds-border-subtle, rgba(255, 255, 255, 0.12))",
            borderRadius: "0.5rem",
            boxShadow: "0 4px 16px rgba(0,0,0,0.24)",
            zIndex: 10,
            overflow: "hidden",
          }}
          role="menu"
          aria-label="Export format options"
        >
          <button
            type="button"
            onClick={handleExportCsv}
            style={{
              display: "block",
              width: "100%",
              padding: "0.75rem 1rem",
              textAlign: "left",
              border: "none",
              backgroundColor: "transparent",
              color: "inherit",
              cursor: "pointer",
              fontSize: "0.875rem",
              transition: "background 120ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
            data-analytics-id={`${analyticsId}.csv`}
            role="menuitem"
          >
            <strong style={{ display: "block", marginBottom: "0.25rem" }}>
              Export CSV
            </strong>
            <span
              style={{
                display: "block",
                fontSize: "0.75rem",
                opacity: 0.72,
              }}
            >
              Complete scenario analysis
            </span>
          </button>
          <button
            type="button"
            onClick={handleExportPowerPoint}
            style={{
              display: "block",
              width: "100%",
              padding: "0.75rem 1rem",
              textAlign: "left",
              border: "none",
              borderTop: "1px solid var(--ds-border-subtle, rgba(255, 255, 255, 0.08))",
              backgroundColor: "transparent",
              color: "inherit",
              cursor: "pointer",
              fontSize: "0.875rem",
              transition: "background 120ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
            data-analytics-id={`${analyticsId}.pptx`}
            role="menuitem"
          >
            <strong style={{ display: "block", marginBottom: "0.25rem" }}>
              Export PowerPoint Data
            </strong>
            <span
              style={{
                display: "block",
                fontSize: "0.75rem",
                opacity: 0.72,
              }}
            >
              JSON format for presentation tools
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
