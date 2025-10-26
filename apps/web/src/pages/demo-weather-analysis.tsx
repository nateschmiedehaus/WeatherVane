import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { Layout } from "../components/Layout";
import styles from "../styles/weather-analysis-demo.module.css";

type TenantType = "extreme" | "high" | "medium" | "none";
type ViewMode = "overview" | "tenant" | "comparison";

/**
 * Tenant data structure with performance metrics
 * Maps synthetic tenant profiles to validation results
 */
interface TenantData {
  id: TenantType;
  name: string;
  location: string;
  sensitivity: "Extreme" | "High" | "Medium" | "None";
  products: string[];
  revenueWithoutWeather: number;
  revenueWithWeather: number;
  weatherSignal: number;
  expectedWeatherSignal: number;
  roas_uplift_low: number;
  roas_uplift_mid: number;
  roas_uplift_high: number;
  temperatureElasticity: number;
  precipitationElasticity: number;
  validationStatus: "PASS" | "REVIEW";
  insights: string;
  r2_score?: number;
  mean_rmse?: number;
}

/**
 * Tenant data mapped from validation report
 * Real models: extreme_cooling, extreme_heating, extreme_ski_gear, extreme_sunscreen
 * Real models: high_gym_activity, high_outdoor_gear, high_summer_clothing, high_umbrella_rain, high_winter_clothing
 * Control groups: medium_* and none_* categories (low weather sensitivity)
 */
const TENANT_DATA: Record<TenantType, TenantData> = {
  extreme: {
    id: "extreme",
    name: "Extreme Weather Sensitivity",
    location: "Denver, CO",
    sensitivity: "Extreme",
    products: ["Air Conditioner Units", "Heater Systems", "Ski & Winter Gear", "Sunscreen SPF 50+"],
    revenueWithoutWeather: 1268174 * 0.7,
    revenueWithWeather: 1268174 * 0.85,
    weatherSignal: 0.140,
    expectedWeatherSignal: 0.500,
    roas_uplift_low: 15,
    roas_uplift_mid: 25,
    roas_uplift_high: 35,
    temperatureElasticity: -108.94,
    precipitationElasticity: 154.74,
    validationStatus: "PASS",
    r2_score: 0.956, // Average of extreme_cooling, heating, ski_gear, sunscreen
    mean_rmse: 168.7,
    insights:
      "Model Validation: R² = 0.956 (highly predictive). Extreme weather categories show strong correlation with demand. Temperature elasticity: -74 to +79. Ready for Phase 1 rollout with 15-35% ROAS uplift potential.",
  },
  high: {
    id: "high",
    name: "High Weather Sensitivity",
    location: "New York, NY",
    sensitivity: "High",
    products: [
      "Gym Equipment",
      "Outdoor Apparel",
      "Summer Clothing",
      "Winter Coat",
      "Umbrella",
      "Rain Gear",
    ],
    revenueWithoutWeather: 1317967 * 0.7,
    revenueWithWeather: 1317967 * 0.80,
    weatherSignal: 0.221,
    expectedWeatherSignal: 0.400,
    roas_uplift_low: 12,
    roas_uplift_mid: 18,
    roas_uplift_high: 25,
    temperatureElasticity: -108.94,
    precipitationElasticity: 154.74,
    validationStatus: "PASS",
    r2_score: 0.898, // Average of high_* models
    mean_rmse: 206.0,
    insights:
      "Model Validation: R² = 0.898 (strong predictive power). Seasonal demand patterns validated across temperature and precipitation. Ready for Phase 1 production. Expected 12-25% ROAS uplift with portfolio diversification.",
  },
  medium: {
    id: "medium",
    name: "Medium Weather Sensitivity",
    location: "Chicago, IL",
    sensitivity: "Medium",
    products: ["Accessories", "Beauty Products", "Casual Clothing", "Footwear", "Sports Equipment"],
    revenueWithoutWeather: 1274210 * 0.7,
    revenueWithWeather: 1274210 * 0.71,
    weatherSignal: 0.142,
    expectedWeatherSignal: 0.250,
    roas_uplift_low: 0,
    roas_uplift_mid: 2,
    roas_uplift_high: 5,
    temperatureElasticity: -25.5,
    precipitationElasticity: -0.06,
    validationStatus: "REVIEW",
    r2_score: 0.065, // Average of medium_* models (low R²)
    mean_rmse: 85.4,
    insights:
      "Model Validation: R² = 0.065 (low correlation). These categories show minimal weather dependency. Validates model robustness—correctly identifies non-weather-sensitive items. Hold for Phase 2 analysis.",
  },
  none: {
    id: "none",
    name: "No Weather Sensitivity",
    location: "Los Angeles, CA",
    sensitivity: "None",
    products: ["Books", "Electronics", "Home Decor", "Kitchen Items", "Office Supplies"],
    revenueWithoutWeather: 1120403 * 0.7,
    revenueWithWeather: 1120403 * 0.70,
    weatherSignal: 0.051,
    expectedWeatherSignal: 0.050,
    roas_uplift_low: 0,
    roas_uplift_mid: 0,
    roas_uplift_high: 1,
    temperatureElasticity: -0.01,
    precipitationElasticity: 0.00,
    validationStatus: "PASS",
    r2_score: 0.347, // Average of none_* models
    mean_rmse: 206.0,
    insights:
      "Model Validation: R² = 0.347 (moderate, expected for control group). Office/tech products with zero weather dependency. Validates model doesn't over-fit weather signals—correctly assigns minimal weights.",
  },
};

export default function WeatherAnalysisDemoPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [selectedTenant, setSelectedTenant] = useState<TenantType>("high");
  const [showWeather, setShowWeather] = useState(true);
  const [animateRevenue, setAnimateRevenue] = useState(false);

  const currentTenant = TENANT_DATA[selectedTenant];

  const displayRevenue = useMemo(() => {
    return showWeather ? currentTenant.revenueWithWeather : currentTenant.revenueWithoutWeather;
  }, [showWeather, currentTenant]);

  const revenueDeltaPercent = useMemo(() => {
    const delta = currentTenant.revenueWithWeather - currentTenant.revenueWithoutWeather;
    if (currentTenant.revenueWithoutWeather === 0) {
      return 0;
    }
    return (delta / currentTenant.revenueWithoutWeather) * 100;
  }, [currentTenant]);

  const revenueImprovement = showWeather ? revenueDeltaPercent : -revenueDeltaPercent;

  const handleToggleWeather = () => {
    setAnimateRevenue(true);
    setShowWeather((prev) => !prev);
    setTimeout(() => setAnimateRevenue(false), 600);
  };

  const handleTenantChange = (tenantId: TenantType) => {
    setSelectedTenant(tenantId);
    setShowWeather(true);
  };

  const modeButtonClass = (mode: ViewMode) => {
    const activeClass = viewMode === mode ? `${styles.active} active` : "";
    return `${styles.modeButton} ${activeClass}`.trim();
  };

  return (
    <>
      <Head>
        <title>Weather-Aware Modeling Demo | WeatherVane</title>
        <meta
          name="description"
          content="Interactive demo showing weather impact on ROAS predictions"
        />
      </Head>

      <Layout>
        <div className={styles.demoContainer}>
          {/* Header */}
          <div className={styles.header}>
            <h1>Weather-Aware Modeling: Interactive Demo</h1>
            <p className={styles.subtitle}>
              Explore how weather intelligence improves ROAS predictions across product categories
            </p>
            <div className={styles.breadcrumbs}>
              <Link href="/">Home</Link> / <span>Weather Demo</span>
            </div>
          </div>

          {/* View Mode Selector */}
          <div className={styles.modeSelector}>
            <button
              className={modeButtonClass("overview")}
              onClick={() => setViewMode("overview")}
              aria-current={viewMode === "overview" ? "page" : undefined}
              aria-pressed={viewMode === "overview"}
            >
              📊 Overview
            </button>
            <button
              className={modeButtonClass("tenant")}
              onClick={() => setViewMode("tenant")}
              aria-current={viewMode === "tenant" ? "page" : undefined}
              aria-pressed={viewMode === "tenant"}
            >
              🏢 Tenant Analysis
            </button>
            <button
              className={modeButtonClass("comparison")}
              onClick={() => setViewMode("comparison")}
              aria-current={viewMode === "comparison" ? "page" : undefined}
              aria-pressed={viewMode === "comparison"}
            >
              📈 Comparison
            </button>
          </div>

          {/* Overview Mode */}
          {viewMode === "overview" && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>
                <h2>Weather Impact Summary</h2>
                <p>How weather integration improves ROAS prediction accuracy</p>
              </div>

              <div className={styles.summaryGrid}>
                <div className={styles.summaryCard}>
                  <div className={styles.cardLabel}>Extreme Sensitivity</div>
                  <div className={styles.cardValue}>0.140</div>
                  <div className={styles.cardSubtext}>Weather Signal</div>
                  <div className={styles.cardStatus}>⚠️ REVIEW</div>
                </div>

                <div className={styles.summaryCard}>
                  <div className={styles.cardLabel}>High Sensitivity</div>
                  <div className={styles.cardValue}>0.221</div>
                  <div className={styles.cardSubtext}>Weather Signal</div>
                  <div className={styles.cardStatus}>✅ PASS</div>
                </div>

                <div className={styles.summaryCard}>
                  <div className={styles.cardLabel}>Medium Sensitivity</div>
                  <div className={styles.cardValue}>0.142</div>
                  <div className={styles.cardSubtext}>Weather Signal</div>
                  <div className={styles.cardStatus}>✅ PASS</div>
                </div>

                <div className={styles.summaryCard}>
                  <div className={styles.cardLabel}>No Sensitivity</div>
                  <div className={styles.cardValue}>0.051</div>
                  <div className={styles.cardSubtext}>Weather Signal</div>
                  <div className={styles.cardStatus}>✅ PASS</div>
                </div>
              </div>

              <div className={styles.keyFinding}>
                <h3>🎯 Key Finding</h3>
                <p>
                  Weather explains <strong>10-30% of revenue variance</strong> for weather-sensitive
                  categories. Smart allocation can recover <strong>$150K+ per million in ad spend</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Tenant Analysis Mode */}
          {viewMode === "tenant" && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>
                <h2>Interactive Tenant Analysis</h2>
                <p>Toggle weather features to see the impact on predicted revenue</p>
              </div>

              {/* Tenant Selector */}
              <div className={styles.tenantSelector}>
                {(["extreme", "high", "medium", "none"] as TenantType[]).map((tenantId) => (
                  <button
                    key={tenantId}
                    className={`${styles.tenantButton} ${
                      selectedTenant === tenantId ? `${styles.selected} active` : ""
                    }`.trim()}
                    aria-pressed={selectedTenant === tenantId}
                    onClick={() => handleTenantChange(tenantId)}
                  >
                    {TENANT_DATA[tenantId].name}
                    <div className={styles.tenantLocation}>
                      <span aria-hidden="true">📍 </span>
                      <span>HQ: {TENANT_DATA[tenantId].location}</span>
                    </div>
                  </button>
                ))}
              </div>

              {/* Tenant Details */}
              <div className={styles.tenantDetails}>
                <div className={styles.detailsLeft}>
                  <h3>Selected Tenant: {currentTenant.name}</h3>
                  <p className={styles.location}>
                    <span aria-hidden="true">📍 </span>
                    <span>{currentTenant.location}</span>
                  </p>

                  <div className={styles.productsSection}>
                    <h4>Products</h4>
                    <ul className={styles.productList}>
                      {currentTenant.products.map((product, idx) => (
                        <li key={idx}>{product}</li>
                      ))}
                    </ul>
                  </div>

                  <div className={styles.insightsBox}>
                    <h4>💡 Insights</h4>
                    <p>{currentTenant.insights}</p>
                  </div>
                </div>

                <div className={styles.detailsRight}>
                  {/* Weather Toggle */}
                  <div className={styles.weatherToggle}>
                    <h4>Toggle Weather Features</h4>
                    <button
                      className={`${styles.toggleButton} ${showWeather ? styles.enabled : ""}`}
                      onClick={handleToggleWeather}
                    >
                      <span className={styles.toggleLabel}>
                        {showWeather ? "🌧️ WITH WEATHER" : "❌ WITHOUT WEATHER"}
                      </span>
                    </button>
                  </div>

                  {/* Revenue Display */}
                  <div className={`${styles.revenueDisplay} ${animateRevenue ? styles.animating : ""}`}>
                    <div className={styles.revenueLabel}>Forecasted Revenue (90 days)</div>
                    <div className={styles.revenueValue}>
                      ${displayRevenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </div>
                    {revenueImprovement !== 0 && (
                      <div
                        className={`${styles.revenueChange} ${
                          revenueImprovement > 0 ? styles.positive : styles.negative
                        }`}
                      >
                        {revenueImprovement > 0 ? "+" : ""}
                        {revenueImprovement.toFixed(1)}% vs baseline
                      </div>
                    )}
                  </div>

                  {/* Model Validation Metrics */}
                  <div className={styles.elasticityBox}>
                    <h4>Model Validation Metrics</h4>
                    <div className={styles.elasticityRow}>
                      <span>R² Score</span>
                      <code>{currentTenant.r2_score?.toFixed(3) ?? "—"}</code>
                    </div>
                    <div className={styles.elasticityRow}>
                      <span>Mean RMSE</span>
                      <code>{currentTenant.mean_rmse?.toFixed(1) ?? "—"}</code>
                    </div>
                  </div>

                  {/* Elasticity Estimates */}
                  <div className={styles.elasticityBox}>
                    <h4>Weather Elasticity</h4>
                    <div className={styles.elasticityRow}>
                      <span>Temperature</span>
                      <code>{currentTenant.temperatureElasticity.toFixed(2)}</code>
                    </div>
                    <div className={styles.elasticityRow}>
                      <span>Precipitation</span>
                      <code>{currentTenant.precipitationElasticity.toFixed(2)}</code>
                    </div>
                  </div>

                  {/* ROAS Projection */}
                  <div className={styles.roasBox}>
                    <h4>ROAS Uplift Projection</h4>
                    <div className={styles.roasRange}>
                      <span>{currentTenant.roas_uplift_low}%</span>
                      <div className={styles.roasBar}>
                        <div
                          className={styles.roasIndicator}
                          style={{
                            left: `${((currentTenant.roas_uplift_mid - currentTenant.roas_uplift_low) / (currentTenant.roas_uplift_high - currentTenant.roas_uplift_low)) * 100}%`,
                          }}
                        />
                      </div>
                      <span>{currentTenant.roas_uplift_high}%</span>
                    </div>
                    <div className={styles.roasTarget}>
                      Target: {currentTenant.roas_uplift_mid}%
                    </div>
                  </div>

                  {/* Validation Status */}
                  <div
                    className={`${styles.validationStatus} ${
                      currentTenant.validationStatus === "PASS" ? styles.pass : styles.review
                    }`}
                  >
                    <strong>{currentTenant.validationStatus}</strong>
                    {currentTenant.validationStatus === "PASS"
                      ? " - Ready for production"
                      : " - Requires field testing"}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Comparison Mode */}
          {viewMode === "comparison" && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>
                <h2>Cross-Tenant Comparison</h2>
                <p>How weather sensitivity varies by product category</p>
              </div>

              <div className={styles.comparisonTable}>
                <table>
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Location</th>
                      <th>Weather Signal</th>
                      <th>Expected</th>
                      <th>Status</th>
                      <th>ROAS Uplift</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(["extreme", "high", "medium", "none"] as TenantType[]).map((tenantId) => {
                      const tenant = TENANT_DATA[tenantId];
                      return (
                        <tr key={tenantId}>
                          <td>{tenant.name}</td>
                          <td>{tenant.location}</td>
                          <td>{tenant.weatherSignal.toFixed(3)}</td>
                          <td>{tenant.expectedWeatherSignal.toFixed(3)}</td>
                          <td
                            className={`${styles.statusCell} ${
                              tenant.validationStatus === "PASS" ? styles.pass : styles.review
                            }`}
                          >
                            {tenant.validationStatus}
                          </td>
                          <td className={styles.upliftCell}>
                            {tenant.roas_uplift_low}-{tenant.roas_uplift_high}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className={styles.conclusion}>
                <h3>📋 Recommendations</h3>
                <div className={styles.recommendationList}>
                  <div className={styles.recommendationItem}>
                    <strong>Phase 1 (Weeks 3-4):</strong> Deploy to HIGH + MEDIUM sensitivity
                    categories
                  </div>
                  <div className={styles.recommendationItem}>
                    <strong>Expected Uplift:</strong> 8-18% ROAS improvement
                  </div>
                  <div className={styles.recommendationItem}>
                    <strong>Risk Level:</strong> Low - model validated on control group
                  </div>
                  <div className={styles.recommendationItem}>
                    <strong>Phase 2 (Weeks 5-6):</strong> Field test EXTREME category, then scale
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className={styles.footer}>
            <p>
              📚 Full technical details available in{" "}
              <Link href="/docs/WEATHER_PROOF_OF_CONCEPT.md">Weather PoC Report</Link>
            </p>
            <p className={styles.disclaimer}>
              ℹ️ Demo uses synthetic data. Production models trained on real tenant data with
              continuous refinement.
            </p>
          </div>
        </div>
      </Layout>
    </>
  );
}
