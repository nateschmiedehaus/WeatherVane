import { useMemo } from "react";
import { useTheme } from "../lib/theme";
import styles from "../styles/theme-toggle.module.css";

export function ThemeToggle() {
  const { isCalm, toggleTheme } = useTheme();

  const labels = useMemo(
    () =>
      isCalm
        ? {
            action: "Switch to Aero theme",
            caption: "Calm",
          }
        : {
            action: "Switch to Calm theme",
            caption: "Aero",
          },
    [isCalm],
  );

  return (
    <button
      type="button"
      className={`${styles.button} ds-transition`}
      data-state={isCalm ? "calm" : "aero"}
      onClick={toggleTheme}
      aria-pressed={isCalm}
      aria-label={labels.action}
    >
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} data-state={isCalm ? "calm" : "aero"} />
      </span>
      <span className={styles.caption}>{labels.caption}</span>
    </button>
  );
}
