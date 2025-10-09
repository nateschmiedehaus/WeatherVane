import styles from "./context-panel.module.css";

interface DisclaimerBannerProps {
  message?: string;
}

export function DisclaimerBanner({ message = "Predictions reflect historical correlations; causal lift remains under validation." }: DisclaimerBannerProps) {
  return (
    <div className={`${styles.panel} ${styles.warningInfo}`}>
      <div className={styles.header}>
        <span>Causal Notice</span>
      </div>
      <p className={styles.bodyCopy}>{message}</p>
    </div>
  );
}
