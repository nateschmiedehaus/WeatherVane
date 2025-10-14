import { ReactNode, useEffect, useState } from "react";
import { NavTabs } from "./NavTabs";
import { ThemeToggle } from "./ThemeToggle";
import { DemoTourDrawer } from "./DemoTourDrawer";
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
      <a href="#main-content" className={`${styles.skipLink} ds-pill ds-caption`}>
        Skip to main content
      </a>
      <div className={styles.backdrop} aria-hidden />
      <header className={styles.header}>
        <div className={styles.branding}>
          <h1 className={`ds-display ${styles.productName}`}>WeatherVane</h1>
          <p className={`ds-subtitle ${styles.tagline}`}>
            Weather-intelligent planning that keeps marketers in control.
          </p>
        </div>
        <div className={styles.toolbar}>
          <ThemeToggle />
          <NavTabs />
        </div>
      </header>
      <main id="main-content" className={styles.main}>
        {children}
      </main>
      <footer className={`${styles.footer} ds-caption`}>
        Built for teams who want weather science without sacrificing simplicity.
      </footer>
      <DemoTourDrawer />
    </div>
  );
}
