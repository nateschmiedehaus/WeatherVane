import Head from "next/head";
import { Layout } from "../components/Layout";
import styles from "../styles/landing.module.css";

const checklist = [
  {
    title: "Connect",
    detail: "Secure OAuth to Shopify, Meta Ads, Google Ads, and Klaviyo. Read-only works for planning; write access enables one-click pushes."
  },
  {
    title: "Tag",
    detail: "Auto-suggest weather and seasonal affinities for products and ads, with human approval in one pane."
  },
  {
    title: "Plan",
    detail: "See the 7-day geo × product × channel budget plan with weather-driven rationales and expected ROI bands."
  },
  {
    title: "Push",
    detail: "Choose Manual, Assist, or Autopilot. WeatherVane applies ramp limits and guardrails before touching campaigns."
  }
];

const promises = [
  {
    highlight: "No hype",
    copy: "We show ranges, assumptions, and error bars—never performance guarantees."
  },
  {
    highlight: "Platform-safe",
    copy: "Budget ramps respect Meta learning stages and Google Smart Bidding guidance."
  },
  {
    highlight: "Ad-aware",
    copy: "Map existing assets to weather runs or generate Ad-Kits when you have gaps."
  }
];

export default function Home() {
  return (
    <Layout>
      <Head>
        <title>WeatherVane · Weather-Intelligent Ads Allocation</title>
      </Head>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <h2>Weather intelligence, without the spreadsheets.</h2>
          <p>
            WeatherVane ingests your commerce, promo, and ad data, learns how weather shifts demand,
            and hands you a marketer-friendly plan you can trust—and optionally auto-push.
          </p>
          <div className={styles.heroCTA}>
            <button type="button">Request access</button>
            <button type="button" className={styles.secondary}>See a sample plan</button>
          </div>
        </div>
        <div className={styles.globe} aria-hidden>
          <div className={styles.isobars} />
        </div>
      </section>

      <section className={styles.checklist}>
        {checklist.map((item) => (
          <article key={item.title}>
            <h3>{item.title}</h3>
            <p>{item.detail}</p>
          </article>
        ))}
      </section>

      <section className={styles.promises}>
        {promises.map((item) => (
          <article key={item.highlight}>
            <h4>{item.highlight}</h4>
            <p>{item.copy}</p>
          </article>
        ))}
      </section>

      <section className={styles.storyCard}>
        <h3>This week&apos;s weather story</h3>
        <p>
          "Heat spike rolling through Texas increases sunscreen uplift 18–24% Thursday–Saturday. We
          rebalanced +$4.5k to high-ROAS campaigns while keeping Smart Bidding within learning
          thresholds."
        </p>
        <span>— WeatherVane Planner</span>
      </section>
    </Layout>
  );
}
