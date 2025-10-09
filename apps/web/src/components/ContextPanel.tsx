import type { ContextWarning } from "../types/context";
import styles from "./context-panel.module.css";

interface ContextPanelProps {
  title?: string;
  tags?: string[];
  warnings?: ContextWarning[];
}

export function ContextPanel({ title = "Data context", tags = [], warnings = [] }: ContextPanelProps) {
  if (tags.length === 0 && warnings.length === 0) {
    return null;
  }

  const hasCritical = warnings.some(
    (warning) => typeof warning.severity === "string" && warning.severity.toLowerCase() === "critical",
  );

  const tone = (severity: string | undefined) => {
    const value = typeof severity === "string" ? severity.toLowerCase() : "";
    if (value === "critical") return styles.warningCritical;
    if (value === "warning") return styles.warningCaution;
    return styles.warningInfo;
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span>{title}</span>
        {hasCritical && <span className={styles.badgeCritical}>Action needed</span>}
      </div>
      {tags.length > 0 && <p className={styles.tags}>{tags.join(", ")}</p>}
      {warnings.length > 0 && (
        <ul className={styles.warningList}>
          {warnings.map((warning) => (
            <li key={warning.code} className={`${styles.warningItem} ${tone(warning.severity)}`}>
              <strong>{(warning.severity ?? "warning").toUpperCase()}</strong>
              <span>{warning.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
