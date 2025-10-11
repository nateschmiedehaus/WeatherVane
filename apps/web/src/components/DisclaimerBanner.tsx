import styles from "./context-panel.module.css";

interface DisclaimerBannerProps {
  message?: string;
}

export function DisclaimerBanner({ message = "Predictions reflect historical correlations; causal lift remains under validation." }: DisclaimerBannerProps) {
  return (
    <section
      className={`${styles.panel} ${styles.warningInfo}`}
      role="note"
      aria-label="Causal inference disclaimer"
    >
      <div className={styles.header}>
        <h3 className={styles.heading}>Causal Notice</h3>
      </div>
      <p className={styles.bodyCopy}>{message}</p>
    </section>
  );
}
