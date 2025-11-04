import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { screen, fireEvent } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
import { LoadScenarioPanel } from "../LoadScenarioPanel";
import type { ScenarioSnapshot } from "../../lib/api";
import { renderWithProviders } from "../../test-utils/renderWithProviders";

expect.extend(matchers);

describe("LoadScenarioPanel", () => {
  const mockSnapshot: ScenarioSnapshot = {
    id: "test-snapshot-1",
    tenant_id: "test-tenant",
    name: "Test Scenario",
    description: "Test description",
    horizon_days: 7,
    adjustments: { Meta: 1.15, Google: 0.9 },
    created_at: "2024-10-21T12:00:00Z",
    created_by: "test-user",
    tags: ["high-confidence", "growth"],
    total_base_spend: 10000,
    total_scenario_spend: 11000,
    total_base_revenue: 30000,
    total_scenario_revenue: 33000,
    scenario_roi: 3.0,
  };

  const mockOnLoad = vi.fn();
  const mockOnDelete = vi.fn();

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading message when loading", () => {
    renderWithProviders(
      <LoadScenarioPanel
        snapshots={[]}
        onLoad={mockOnLoad}
        onDelete={mockOnDelete}
        loading={true}
      />
    );
    expect(screen.getByText(/loading saved scenarios/i)).toBeInTheDocument();
  });

  it("shows empty state when no snapshots", () => {
    renderWithProviders(
      <LoadScenarioPanel snapshots={[]} onLoad={mockOnLoad} onDelete={mockOnDelete} />
    );
    expect(screen.getByText(/no saved scenarios yet/i)).toBeInTheDocument();
  });

  it("renders snapshot cards", () => {
    renderWithProviders(
      <LoadScenarioPanel
        snapshots={[mockSnapshot]}
        onLoad={mockOnLoad}
        onDelete={mockOnDelete}
      />
    );
    expect(screen.getByText("Test Scenario")).toBeInTheDocument();
  });

  it("displays snapshot metadata", () => {
    renderWithProviders(
      <LoadScenarioPanel
        snapshots={[mockSnapshot]}
        onLoad={mockOnLoad}
        onDelete={mockOnDelete}
      />
    );
    expect(screen.getByText("Test description")).toBeInTheDocument();
    expect(screen.getByText("high-confidence")).toBeInTheDocument();
    expect(screen.getByText("growth")).toBeInTheDocument();
  });

  it("displays scenario summary metrics", () => {
    renderWithProviders(
      <LoadScenarioPanel
        snapshots={[mockSnapshot]}
        onLoad={mockOnLoad}
        onDelete={mockOnDelete}
      />
    );
    expect(screen.getByText(/channels adjusted/i)).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // 2 channels
    expect(screen.getByText("$11,000")).toBeInTheDocument(); // scenario spend
    expect(screen.getByText("3.00x")).toBeInTheDocument(); // ROI
  });

  it("calls onLoad when load button clicked", () => {
    renderWithProviders(
      <LoadScenarioPanel
        snapshots={[mockSnapshot]}
        onLoad={mockOnLoad}
        onDelete={mockOnDelete}
      />
    );
    const loadButton = screen.getByText("Load scenario");
    fireEvent.click(loadButton);
    expect(mockOnLoad).toHaveBeenCalledWith(mockSnapshot);
  });

  it("expands details when expand button clicked", () => {
    renderWithProviders(
      <LoadScenarioPanel
        snapshots={[mockSnapshot]}
        onLoad={mockOnLoad}
        onDelete={mockOnDelete}
      />
    );
    const expandButton = screen.getByLabelText("Expand details");
    fireEvent.click(expandButton);

    expect(screen.getByText("Channel adjustments")).toBeInTheDocument();
    expect(screen.getByText("Meta")).toBeInTheDocument();
    expect(screen.getByText("+15%")).toBeInTheDocument();
    expect(screen.getByText("Google")).toBeInTheDocument();
    expect(screen.getByText("-10%")).toBeInTheDocument();
  });

  it("collapses details when collapse button clicked", () => {
    renderWithProviders(
      <LoadScenarioPanel
        snapshots={[mockSnapshot]}
        onLoad={mockOnLoad}
        onDelete={mockOnDelete}
      />
    );
    const expandButton = screen.getByLabelText("Expand details");
    fireEvent.click(expandButton);

    const collapseButton = screen.getByLabelText("Collapse details");
    fireEvent.click(collapseButton);

    expect(screen.queryByText("Channel adjustments")).not.toBeInTheDocument();
  });

  it("calls onDelete when delete button clicked", () => {
    renderWithProviders(
      <LoadScenarioPanel
        snapshots={[mockSnapshot]}
        onLoad={mockOnLoad}
        onDelete={mockOnDelete}
      />
    );

    // Expand to show delete button
    const expandButton = screen.getByLabelText("Expand details");
    fireEvent.click(expandButton);

    const deleteButton = screen.getByText("Delete scenario");
    fireEvent.click(deleteButton);

    expect(mockOnDelete).toHaveBeenCalledWith("test-snapshot-1");
  });

  it("renders multiple snapshots", () => {
    const snapshot2: ScenarioSnapshot = {
      ...mockSnapshot,
      id: "test-snapshot-2",
      name: "Second Scenario",
    };

    renderWithProviders(
      <LoadScenarioPanel
        snapshots={[mockSnapshot, snapshot2]}
        onLoad={mockOnLoad}
        onDelete={mockOnDelete}
      />
    );

    expect(screen.getByText("Test Scenario")).toBeInTheDocument();
    expect(screen.getByText("Second Scenario")).toBeInTheDocument();
  });

  it("formats dates correctly", () => {
    renderWithProviders(
      <LoadScenarioPanel
        snapshots={[mockSnapshot]}
        onLoad={mockOnLoad}
        onDelete={mockOnDelete}
      />
    );
    // Date should be formatted as "Oct 21, 2024, 12:00 PM" or similar
    expect(screen.getByText(/Oct 21, 2024/i)).toBeInTheDocument();
  });

  it("handles missing optional fields gracefully", () => {
    const snapshotWithoutOptionalFields: ScenarioSnapshot = {
      ...mockSnapshot,
      description: null,
      tags: [],
      total_scenario_spend: null,
      scenario_roi: null,
    };

    renderWithProviders(
      <LoadScenarioPanel
        snapshots={[snapshotWithoutOptionalFields]}
        onLoad={mockOnLoad}
        onDelete={mockOnDelete}
      />
    );

    expect(screen.getByText("Test Scenario")).toBeInTheDocument();
    expect(screen.queryByText("Test description")).not.toBeInTheDocument();
    // Should show "—" for missing values
    expect(screen.getAllByText("—")).toHaveLength(2); // spend and ROI
  });

  it("shows positive and negative adjustments with different styling", () => {
    renderWithProviders(
      <LoadScenarioPanel
        snapshots={[mockSnapshot]}
        onLoad={mockOnLoad}
        onDelete={mockOnDelete}
      />
    );

    const expandButton = screen.getByLabelText("Expand details");
    fireEvent.click(expandButton);

    const metaAdjustment = screen.getByText("+15%");
    const googleAdjustment = screen.getByText("-10%");

    // Classes are CSS modules, so just check they exist
    expect(metaAdjustment.className).toContain("positive");
    expect(googleAdjustment.className).toContain("negative");
  });
});
