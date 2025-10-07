import Head from "next/head";
import { Layout } from "../components/Layout";
import styles from "../styles/stories.module.css";

const stories = [
  {
    title: "Rain bands moving into Seattle",
    summary:
      "Rain jackets historically gain +26% revenue vs baseline under similar anomalies. We recommend +$3.2k across Thursday–Saturday.",
    detail: "Guardrails respected: ROAS band 2.8× – 3.6×, spend ramp +12%", 
    icon: "🌧"
  },
  {
    title: "Heat surge across Texas",
    summary:
      "Feels-like > 100°F for 3 consecutive days. Sunscreen, cooling towels, and shorts clusters pulled +$6.1k headroom in backtest.",
    detail: "Shift $4k from evergreen prospecting to high-heat segments.",
    icon: "🌡"
  }
];

export default function StoriesPage() {
  return (
    <Layout>
      <Head>
        <title>WeatherVane · Stories</title>
      </Head>
      <section className={styles.header}>
        <h2>Weekly weather stories</h2>
        <p>
          Digestible narratives for the team. Each story combines forecast anomalies, promo context,
          and expected incremental profit, ready to drop in your weekly memo.
        </p>
      </section>
      <section className={styles.grid}>
        {stories.map((story) => (
          <article key={story.title}>
            <span aria-hidden>{story.icon}</span>
            <h3>{story.title}</h3>
            <p>{story.summary}</p>
            <footer>{story.detail}</footer>
          </article>
        ))}
      </section>
    </Layout>
  );
}
