import Link from "next/link";
import { useRouter } from "next/router";
import styles from "../styles/navtabs.module.css";

const tabs = [
  { href: "/", label: "Overview" },
  { href: "/setup", label: "Setup" },
  { href: "/plan", label: "Plan" },
  { href: "/scenarios", label: "Scenarios" },
  { href: "/dashboard", label: "WeatherOps" },
  { href: "/weather-runbook", label: "Runbook" },
  { href: "/stories", label: "Stories" },
  { href: "/reports", label: "Reports" },
  { href: "/experiments", label: "Experiments" },
  { href: "/catalog", label: "Catalog" },
  { href: "/automations", label: "Automations" },
];

export function NavTabs() {
  const { pathname } = useRouter();

  return (
    <nav className={`${styles.nav} ds-surface-glass`} aria-label="Primary">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`${isActive ? styles.active : styles.link} ds-transition`}
            aria-current={isActive ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
