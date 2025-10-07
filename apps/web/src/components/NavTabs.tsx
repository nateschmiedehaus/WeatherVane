import Link from "next/link";
import { useRouter } from "next/router";
import styles from "../styles/navtabs.module.css";

const tabs = [
  { href: "/", label: "Overview" },
  { href: "/plan", label: "Plan" },
  { href: "/stories", label: "Stories" },
  { href: "/catalog", label: "Catalog" },
  { href: "/automations", label: "Automations" }
];

export function NavTabs() {
  const { pathname } = useRouter();

  return (
    <nav className={styles.nav} aria-label="Primary">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={isActive ? styles.active : styles.link}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
