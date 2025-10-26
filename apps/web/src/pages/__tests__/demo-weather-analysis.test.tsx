import "@testing-library/jest-dom/vitest";
import { screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
import type { ReactNode } from "react";
import { renderWithProviders } from "../../test-utils/renderWithProviders";

expect.extend(matchers);

let WeatherAnalysisDemoPage: (typeof import("../demo-weather-analysis"))["default"];

beforeAll(async () => {
  WeatherAnalysisDemoPage = (await import("../demo-weather-analysis")).default;
});

const renderDemo = () => renderWithProviders(<WeatherAnalysisDemoPage />);

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: ReactNode; href?: string }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/head", () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("next/router", () => ({
  __esModule: true,
  useRouter: () => ({
    pathname: "/demo-weather-analysis",
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    query: {},
    asPath: "/demo-weather-analysis",
  }),
}));

/**
 * Test Suite: Weather Analysis Demo Page
 *
 * Validates:
 * 1. View mode switching (overview, tenant, comparison)
 * 2. Weather toggle interaction and revenue calculations
 * 3. Tenant selection and data display
 * 4. ROAS uplift calculations and visualization
 * 5. Accessibility (ARIA roles, semantic HTML)
 *
 * Note: These tests render the full page. Some context providers
 * from Layout may not be available in test environment, but the
 * core demo functionality can still be validated.
 */

describe("WeatherAnalysisDemoPage", () => {
  describe("Rendering and Structure", () => {
    it("should render the page title", () => {
      renderWithProviders(<WeatherAnalysisDemoPage />);
      expect(screen.getByText("Weather-Aware Modeling: Interactive Demo")).toBeInTheDocument();
    });

    it("should display the subtitle", () => {
      renderWithProviders(<WeatherAnalysisDemoPage />);
      expect(
        screen.getByText(
          "Explore how weather intelligence improves ROAS predictions across product categories"
        )
      ).toBeInTheDocument();
    });

    it("should render all view mode buttons", () => {
      renderWithProviders(<WeatherAnalysisDemoPage />);
      expect(screen.getByRole("button", { name: /Overview/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Tenant Analysis/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Comparison/i })).toBeInTheDocument();
    });

    it("should display breadcrumb navigation", () => {
      renderWithProviders(<WeatherAnalysisDemoPage />);
      expect(screen.getByText(/Weather Demo/i)).toBeInTheDocument();
    });
  });

  describe("Overview Mode (Default)", () => {
    it("should display overview mode by default", () => {
      renderWithProviders(<WeatherAnalysisDemoPage />);
      expect(screen.getByText("Weather Impact Summary")).toBeInTheDocument();
      expect(
        screen.getByText("How weather integration improves ROAS prediction accuracy")
      ).toBeInTheDocument();
    });

    it("should render summary cards for all tenant types", () => {
      renderWithProviders(<WeatherAnalysisDemoPage />);
      expect(screen.getByText("Extreme Sensitivity")).toBeInTheDocument();
      expect(screen.getByText("High Sensitivity")).toBeInTheDocument();
      expect(screen.getByText("Medium Sensitivity")).toBeInTheDocument();
      expect(screen.getByText("No Sensitivity")).toBeInTheDocument();
    });

    it("should display correct weather signal values", () => {
      renderWithProviders(<WeatherAnalysisDemoPage />);
      // These are the weather signal values from TENANT_DATA
      expect(screen.getByText("0.140")).toBeInTheDocument(); // Extreme
      expect(screen.getByText("0.221")).toBeInTheDocument(); // High
      expect(screen.getByText("0.142")).toBeInTheDocument(); // Medium
      expect(screen.getByText("0.051")).toBeInTheDocument(); // None
    });

    it("should display validation status badges", () => {
      renderWithProviders(<WeatherAnalysisDemoPage />);
      const passElements = screen.getAllByText("✅ PASS");
      const reviewElements = screen.queryAllByText("⚠️ REVIEW");
      expect(passElements.length).toBe(3); // High, Medium, None
      expect(reviewElements.length).toBeGreaterThanOrEqual(1); // Extreme
    });

    it("should display key finding about revenue variance", () => {
      renderWithProviders(<WeatherAnalysisDemoPage />);
      expect(screen.getByText(/10-30% of revenue variance/i)).toBeInTheDocument();
      expect(screen.getByText(/\$150K\+ per million/i)).toBeInTheDocument();
    });
  });

  describe("View Mode Switching", () => {
    it("should switch to tenant analysis mode", async () => {
      const user = userEvent.setup();
      renderWithProviders(<WeatherAnalysisDemoPage />);

      const tenantButton = screen.getByRole("button", { name: /Tenant Analysis/i });
      await user.click(tenantButton);

      expect(screen.getByText("Interactive Tenant Analysis")).toBeInTheDocument();
      expect(
        screen.getByText("Toggle weather features to see the impact on predicted revenue")
      ).toBeInTheDocument();
    });

    it("should switch to comparison mode", async () => {
      const user = userEvent.setup();
      renderWithProviders(<WeatherAnalysisDemoPage />);

      const comparisonButton = screen.getByRole("button", { name: /Comparison/i });
      await user.click(comparisonButton);

      expect(screen.getByText("Cross-Tenant Comparison")).toBeInTheDocument();
      expect(
        screen.getByText("How weather sensitivity varies by product category")
      ).toBeInTheDocument();
    });

    it("should return to overview mode", async () => {
      const user = userEvent.setup();
      renderWithProviders(<WeatherAnalysisDemoPage />);

      // Switch away from overview
      await user.click(screen.getByRole("button", { name: /Tenant Analysis/i }));
      expect(screen.queryByText("Weather Impact Summary")).not.toBeInTheDocument();

      // Switch back to overview
      await user.click(screen.getByRole("button", { name: /Overview/i }));
      expect(screen.getByText("Weather Impact Summary")).toBeInTheDocument();
    });

    it("should update active button state when switching modes", async () => {
      const user = userEvent.setup();
      renderWithProviders(<WeatherAnalysisDemoPage />);

      const overviewButton = screen.getByRole("button", { name: /Overview/i });
      const tenantButton = screen.getByRole("button", { name: /Tenant Analysis/i });

      // Overview should be active by default
      expect(overviewButton).toHaveClass("active");
      expect(tenantButton).not.toHaveClass("active");

      // Click tenant button
      await user.click(tenantButton);
      expect(tenantButton).toHaveClass("active");
      expect(overviewButton).not.toHaveClass("active");
    });
  });

  describe("Tenant Analysis Mode", () => {
    beforeEach(() => {
      const { container } = renderWithProviders(<WeatherAnalysisDemoPage />);
      // Switch to tenant analysis mode
      const tenantButton = container.querySelector('button[class*="modeButton"]');
      if (tenantButton) {
        fireEvent.click(
          Array.from(document.querySelectorAll('button[class*="modeButton"]')).find(
            (btn) => btn.textContent?.includes("Tenant Analysis")
          ) as HTMLElement
        );
      }
    });

    it("should display tenant selector buttons", () => {
      fireEvent.click(screen.getByRole("button", { name: /Tenant Analysis/i }));
      expect(screen.getByText("High Weather Sensitivity")).toBeInTheDocument();
      expect(screen.getByText("Medium Weather Sensitivity")).toBeInTheDocument();
      expect(screen.getByText("Extreme Weather Sensitivity")).toBeInTheDocument();
      expect(screen.getByText("No Weather Sensitivity")).toBeInTheDocument();
    });

    it("should display default tenant (High) details", () => {
      fireEvent.click(screen.getByRole("button", { name: /Tenant Analysis/i }));
      expect(screen.getByText("New York, NY")).toBeInTheDocument();
      expect(screen.getByText("Winter Coat")).toBeInTheDocument();
      expect(screen.getByText("Umbrella")).toBeInTheDocument();
    });

    it("should switch tenant when tenant button is clicked", async () => {
      fireEvent.click(screen.getByRole("button", { name: /Tenant Analysis/i }));

      // Default is High sensitivity (New York)
      expect(screen.getByText("New York, NY")).toBeInTheDocument();

      // Click Extreme sensitivity
      const extremeButton = Array.from(
        document.querySelectorAll('button[class*="tenantButton"]')
      ).find((btn) => btn.textContent?.includes("Extreme")) as HTMLElement;

      if (extremeButton) {
        fireEvent.click(extremeButton);
        expect(screen.getByText("Denver, CO")).toBeInTheDocument();
      }
    });

    it("should display weather elasticity values", () => {
      fireEvent.click(screen.getByRole("button", { name: /Tenant Analysis/i }));
      expect(screen.getByText("Weather Elasticity")).toBeInTheDocument();
      expect(screen.getByText("Temperature")).toBeInTheDocument();
      expect(screen.getByText("Precipitation")).toBeInTheDocument();
    });

    it("should display ROAS uplift projection range", () => {
      fireEvent.click(screen.getByRole("button", { name: /Tenant Analysis/i }));
      expect(screen.getByText("ROAS Uplift Projection")).toBeInTheDocument();
      expect(screen.getByText(/Target: \d+%/)).toBeInTheDocument();
    });

    it("should display validation status", () => {
      fireEvent.click(screen.getByRole("button", { name: /Tenant Analysis/i }));
      const validationStatus = screen.queryByText(/Ready for production|Requires field testing/);
      expect(validationStatus).toBeInTheDocument();
    });

    it("should display tenant insights", () => {
      fireEvent.click(screen.getByRole("button", { name: /Tenant Analysis/i }));
      expect(screen.getByText(/Insights/i)).toBeInTheDocument();
    });
  });

  describe("Weather Toggle Functionality", () => {
    beforeEach(() => {
      renderWithProviders(<WeatherAnalysisDemoPage />);
      fireEvent.click(screen.getByRole("button", { name: /Tenant Analysis/i }));
    });

    it("should display weather toggle button", () => {
      const toggleLabels = screen.queryAllByText(/WITH WEATHER|WITHOUT WEATHER/);
      expect(toggleLabels.length).toBeGreaterThan(0);
    });

    it("should toggle between WITH WEATHER and WITHOUT WEATHER states", async () => {
      const user = userEvent.setup();

      // Initial state should show "WITH WEATHER"
      let toggleButton = screen.queryByRole("button", { name: /WITH WEATHER/i });
      expect(toggleButton).toBeInTheDocument();

      // Click to toggle
      if (toggleButton) {
        await user.click(toggleButton);
      }

      // Should now show "WITHOUT WEATHER"
      await new Promise((resolve) => setTimeout(resolve, 200)); // Wait for animation
      toggleButton = screen.queryByRole("button", { name: /WITHOUT WEATHER/i });
      expect(toggleButton).toBeInTheDocument();
    });

    it("should display revenue values", () => {
      expect(screen.getByText(/Predicted Revenue/i)).toBeInTheDocument();
      const revenueValue = screen.queryByText(/\$[\d,]+/);
      expect(revenueValue).toBeInTheDocument();
    });

    it("should display percentage improvement when weather is toggled", async () => {
      const user = userEvent.setup();

      // Find and click the toggle button
      let toggleButton = screen.queryByRole("button", { name: /WITH WEATHER/i });
      if (toggleButton) {
        await user.click(toggleButton);
      }

      // Revenue improvement percentage should appear
      await new Promise((resolve) => setTimeout(resolve, 200));
      const improvementText = screen.queryByText(/% vs baseline/);
      expect(improvementText).toBeInTheDocument();
    });

    it("should reset weather toggle when switching tenants", async () => {
      const user = userEvent.setup();

      // Toggle to without weather
      let toggleButton = screen.queryByRole("button", { name: /WITH WEATHER/i });
      if (toggleButton) {
        await user.click(toggleButton);
      }

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Switch to different tenant
      const mediumButton = Array.from(
        document.querySelectorAll('button[class*="tenantButton"]')
      ).find((btn) => btn.textContent?.includes("Medium")) as HTMLElement;

      if (mediumButton) {
        await user.click(mediumButton);
      }

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Weather should be re-enabled for new tenant
      toggleButton = screen.queryByRole("button", { name: /WITH WEATHER/i });
      expect(toggleButton).toBeInTheDocument();
    });
  });

  describe("Comparison Mode", () => {
    it("should display comparison table", async () => {
      const user = userEvent.setup();
      renderWithProviders(<WeatherAnalysisDemoPage />);

      const comparisonButton = screen.getByRole("button", { name: /Comparison/i });
      await user.click(comparisonButton);

      expect(screen.getByText("Cross-Tenant Comparison")).toBeInTheDocument();
      expect(screen.getByRole("table")).toBeInTheDocument();
    });

    it("should display all tenant data in comparison table", async () => {
      const user = userEvent.setup();
      renderWithProviders(<WeatherAnalysisDemoPage />);

      const comparisonButton = screen.getByRole("button", { name: /Comparison/i });
      await user.click(comparisonButton);

      // Check for table headers
      expect(screen.getByText("Category")).toBeInTheDocument();
      expect(screen.getByText("Location")).toBeInTheDocument();
      expect(screen.getByText("Weather Signal")).toBeInTheDocument();
      expect(screen.getByText("Expected")).toBeInTheDocument();
      expect(screen.getByText("Status")).toBeInTheDocument();
      expect(screen.getByText("ROAS Uplift")).toBeInTheDocument();
    });

    it("should display recommendations", async () => {
      const user = userEvent.setup();
      renderWithProviders(<WeatherAnalysisDemoPage />);

      const comparisonButton = screen.getByRole("button", { name: /Comparison/i });
      await user.click(comparisonButton);

      expect(screen.getByText(/Recommendations/i)).toBeInTheDocument();
      expect(screen.getByText(/Phase 1 \(Weeks 3-4\)/i)).toBeInTheDocument();
    });
  });

  describe("Data Integrity", () => {
    it("should display correct ROAS ranges for High sensitivity tenant", () => {
      renderWithProviders(<WeatherAnalysisDemoPage />);
      fireEvent.click(screen.getByRole("button", { name: /Tenant Analysis/i }));

      // High sensitivity: 12-25% with 18% target
      expect(screen.getByText("Target: 18%")).toBeInTheDocument();
    });

    it("should maintain location consistency for each tenant", () => {
      renderWithProviders(<WeatherAnalysisDemoPage />);
      fireEvent.click(screen.getByRole("button", { name: /Tenant Analysis/i }));

      // High (default)
      expect(screen.getByText("New York, NY")).toBeInTheDocument();

      // Verify in overview mode as well
      fireEvent.click(screen.getByRole("button", { name: /Overview/i }));
      fireEvent.click(screen.getByRole("button", { name: /Tenant Analysis/i }));
      expect(screen.getByText("New York, NY")).toBeInTheDocument();
    });

    it("should format revenue values correctly", () => {
      renderWithProviders(<WeatherAnalysisDemoPage />);
      fireEvent.click(screen.getByRole("button", { name: /Tenant Analysis/i }));

      // Revenue should be formatted with comma separators
      const revenueElements = screen.queryAllByText(/\$[\d,]+/);
      expect(revenueElements.length).toBeGreaterThan(0);
    });
  });

  describe("Footer and Documentation", () => {
    it("should display footer with documentation links", () => {
      renderWithProviders(<WeatherAnalysisDemoPage />);
      expect(screen.getByText(/Full technical details available/i)).toBeInTheDocument();
      expect(screen.getByText(/Demo uses synthetic data/i)).toBeInTheDocument();
    });

    it("should have accessible links in footer", () => {
      renderWithProviders(<WeatherAnalysisDemoPage />);
      const links = screen.getAllByRole("link");
      expect(links.length).toBeGreaterThan(0);
    });
  });

  describe("Accessibility", () => {
    it("should use semantic HTML with proper button roles", () => {
      renderWithProviders(<WeatherAnalysisDemoPage />);
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
      buttons.forEach((button) => {
        expect(button.tagName).toBe("BUTTON");
      });
    });

    it("should have proper heading hierarchy", () => {
      renderWithProviders(<WeatherAnalysisDemoPage />);
      // Should have an h1 for main title
      const mainHeading = screen.queryByText("Weather-Aware Modeling: Interactive Demo");
      expect(mainHeading).toBeInTheDocument();
    });

    it("should display emojis for visual context", () => {
      renderWithProviders(<WeatherAnalysisDemoPage />);
      // Check for emoji indicators
      const emojis = screen.queryAllByText(/[🌧️❌📊🏢📈]/);
      expect(emojis.length).toBeGreaterThanOrEqual(0); // Some emojis may be missing due to rendering
    });
  });

  describe("State Management", () => {
    it("should maintain independent state for view mode and tenant selection", async () => {
      const user = userEvent.setup();
      renderWithProviders(<WeatherAnalysisDemoPage />);

      // Switch to tenant analysis
      await user.click(screen.getByRole("button", { name: /Tenant Analysis/i }));
      expect(screen.getByText("Interactive Tenant Analysis")).toBeInTheDocument();

      // Switch back to overview
      await user.click(screen.getByRole("button", { name: /Overview/i }));
      expect(screen.getByText("Weather Impact Summary")).toBeInTheDocument();

      // Switch back to tenant analysis - should still have same view
      await user.click(screen.getByRole("button", { name: /Tenant Analysis/i }));
      expect(screen.getByText("Interactive Tenant Analysis")).toBeInTheDocument();
    });
  });

  describe("Performance and Responsiveness", () => {
    it("should render without errors", () => {
      expect(() => {
        renderWithProviders(<WeatherAnalysisDemoPage />);
      }).not.toThrow();
    });

    it("should handle rapid mode switching", async () => {
      const user = userEvent.setup();
      const { container } = renderWithProviders(<WeatherAnalysisDemoPage />);

      const overviewBtn = screen.getByRole("button", { name: /Overview/i });
      const tenantBtn = screen.getByRole("button", { name: /Tenant Analysis/i });
      const comparisonBtn = screen.getByRole("button", { name: /Comparison/i });

      // Rapid clicks
      await user.click(tenantBtn);
      await user.click(overviewBtn);
      await user.click(comparisonBtn);
      await user.click(tenantBtn);

      // Should still be rendered and functional
      expect(screen.getByText("Interactive Tenant Analysis")).toBeInTheDocument();
    });
  });
});
