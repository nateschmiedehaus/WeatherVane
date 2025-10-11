import { ReactNode, useEffect, useState } from "react";
import { NavTabs } from "./NavTabs";
import styles from "../styles/layout.module.css";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [prefersReducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(media.matches);
    const listener = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    media.addEventListener("change", listener);
    document.documentElement.dataset.reducedMotion = media.matches ? "true" : "false";
    return () => media.removeEventListener("change", listener);
  }, []);

  return (
    <div className={styles.shell} data-reduced-motion={prefersReducedMotion}>
      <a href="#main-content" className={styles.skipLink}>
        Skip to main content
      </a>
      <div className={styles.backdrop} aria-hidden />
      <header className={styles.header}>
        <div>
          <h1>WeatherVane</h1>
          <p>Weather-intelligent planning that keeps marketers in control.</p>
        </div>
        <NavTabs />
      </header>
      <main id="main-content" className={styles.main}>
        {children}
      </main>
      <footer className={styles.footer}>
        Built for teams who want weather science without sacrificing simplicity.
      </footer>
    </div>
  );
}
