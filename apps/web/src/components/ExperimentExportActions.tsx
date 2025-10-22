import { useCallback, useState } from "react";

import type { ExperimentExportContext } from "../lib/experiment-insights";
import { buildExperimentCsv, buildExportFileName, buildSlidesOutline } from "../lib/experiment-insights";
import styles from "../styles/plan.module.css";

interface Props extends ExperimentExportContext {
  disabled?: boolean;
}

function downloadFile(contents: string, filename: string, mimeType: string) {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export function ExperimentExportActions({ report, executiveSummary, signals, disabled }: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buildContext = useCallback(
    () => ({
      report,
      executiveSummary,
      signals,
    }),
    [report, executiveSummary, signals],
  );

  const handleDownloadCsv = useCallback(() => {
    try {
      const context = buildContext();
      const csv = buildExperimentCsv(context);
      const filename = buildExportFileName(report, "csv");
      downloadFile(csv, filename, "text/csv");
      setStatus("CSV export downloaded.");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate CSV export.");
      setStatus(null);
    }
  }, [buildContext, report]);

  const handleCopySlides = useCallback(async () => {
    try {
      const context = buildContext();
      const outline = buildSlidesOutline(context);
      await copyToClipboard(outline);
      setStatus("Slides outline copied to clipboard.");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to copy slides outline.");
      setStatus(null);
    }
  }, [buildContext]);

  return (
    <div className={`${styles.summaryCard} ds-surface-card`} aria-label="Share experiment results">
      <div className={styles.exportHeader}>
        <div>
          <h3 className="ds-body-strong">Share experiment insights</h3>
          <p className="ds-body">
            Download a CSV package with lift metrics and telemetry, or copy the board-ready slide outline to brief
            stakeholders in minutes.
          </p>
        </div>
        <div className={styles.exportActions}>
          <button
            type="button"
            className={styles.exportButton}
            onClick={handleDownloadCsv}
            disabled={disabled}
          >
            Download CSV
          </button>
          <button
            type="button"
            className={styles.exportButtonSecondary}
            onClick={handleCopySlides}
            disabled={disabled}
          >
            Copy slide outline
          </button>
        </div>
      </div>
      {(status || error) && (
        <div className={styles.exportStatus} role="status">
          {status && <span className="ds-caption" data-tone="success">{status}</span>}
          {error && <span className="ds-caption" data-tone="critical">{error}</span>}
        </div>
      )}
    </div>
  );
}
