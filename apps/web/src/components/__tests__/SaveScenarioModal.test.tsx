import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
import { SaveScenarioModal } from "../SaveScenarioModal";
import { renderWithProviders } from "../../test-utils/renderWithProviders";

expect.extend(matchers);

describe("SaveScenarioModal", () => {
  const mockOnClose = vi.fn();
  const mockOnSave = vi.fn().mockResolvedValue(undefined);

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    const { container } = renderWithProviders(
      <SaveScenarioModal isOpen={false} onClose={mockOnClose} onSave={mockOnSave} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders modal when open", () => {
    renderWithProviders(<SaveScenarioModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);
    expect(screen.getByRole("heading", { name: /save scenario/i })).toBeInTheDocument();
  });

  it("requires scenario name", () => {
    renderWithProviders(<SaveScenarioModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);
    const saveButton = screen.getByRole("button", { name: /save scenario/i });
    expect(saveButton).toBeDisabled();
  });

  it("enables save button when name is entered", () => {
    renderWithProviders(<SaveScenarioModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);
    const nameInput = screen.getByLabelText(/scenario name/i);
    fireEvent.change(nameInput, { target: { value: "Test Scenario" } });
    const saveButton = screen.getByRole("button", { name: /save scenario/i });
    expect(saveButton).not.toBeDisabled();
  });

  it("calls onClose when cancel button clicked", () => {
    renderWithProviders(<SaveScenarioModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);
    const cancelButton = screen.getByText("Cancel");
    fireEvent.click(cancelButton);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when close button clicked", () => {
    renderWithProviders(<SaveScenarioModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);
    const closeButton = screen.getByLabelText("Close dialog");
    fireEvent.click(closeButton);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when clicking overlay", () => {
    const { container } = renderWithProviders(<SaveScenarioModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);
    const overlay = container.firstChild as HTMLElement;
    if (overlay) {
      fireEvent.click(overlay);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    }
  });

  it("does not close when clicking modal content", () => {
    renderWithProviders(<SaveScenarioModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);
    const modal = screen.getByRole("heading", { name: /save scenario/i }).parentElement;
    if (modal) {
      fireEvent.click(modal);
      expect(mockOnClose).not.toHaveBeenCalled();
    }
  });

  it("calls onSave with name and description when submitted", async () => {
    renderWithProviders(<SaveScenarioModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);

    const nameInput = screen.getByLabelText(/scenario name/i);
    fireEvent.change(nameInput, { target: { value: "Test Scenario" } });

    const descInput = screen.getByLabelText(/description/i);
    fireEvent.change(descInput, { target: { value: "Test description" } });

    const saveButton = screen.getByRole("button", { name: /save scenario/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith("Test Scenario", "Test description", []);
    });
  });

  it("allows adding tags", () => {
    renderWithProviders(<SaveScenarioModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);

    const tagInput = screen.getByLabelText(/tags/i);
    fireEvent.change(tagInput, { target: { value: "high-confidence" } });

    const addTagButton = screen.getByText("Add tag");
    fireEvent.click(addTagButton);

    expect(screen.getByText("high-confidence")).toBeInTheDocument();
  });

  it("allows removing tags", () => {
    renderWithProviders(<SaveScenarioModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);

    // Add a tag
    const tagInput = screen.getByLabelText(/tags/i);
    fireEvent.change(tagInput, { target: { value: "test-tag" } });
    const addTagButton = screen.getByText("Add tag");
    fireEvent.click(addTagButton);

    // Remove the tag
    const removeButton = screen.getByLabelText("Remove tag test-tag");
    fireEvent.click(removeButton);

    expect(screen.queryByText("test-tag")).not.toBeInTheDocument();
  });

  it("prevents duplicate tags", () => {
    renderWithProviders(<SaveScenarioModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);

    const tagInput = screen.getByLabelText(/tags/i);
    const addTagButton = screen.getByText("Add tag");

    // Add first tag
    fireEvent.change(tagInput, { target: { value: "duplicate" } });
    fireEvent.click(addTagButton);

    // Try to add duplicate
    fireEvent.change(tagInput, { target: { value: "duplicate" } });
    fireEvent.click(addTagButton);

    const tags = screen.getAllByText("duplicate");
    expect(tags).toHaveLength(1); // Should only have one instance
  });

  it("adds tag when Enter key is pressed", () => {
    renderWithProviders(<SaveScenarioModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);

    const tagInput = screen.getByLabelText(/tags/i);
    fireEvent.change(tagInput, { target: { value: "enter-tag" } });
    fireEvent.keyDown(tagInput, { key: "Enter", code: "Enter" });

    expect(screen.getByText("enter-tag")).toBeInTheDocument();
  });

  it("disables form when saving", () => {
    renderWithProviders(<SaveScenarioModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} isSaving={true} />);

    const nameInput = screen.getByLabelText(/scenario name/i);
    const saveButton = screen.getByRole("button", { name: /saving/i });
    const cancelButton = screen.getByRole("button", { name: /cancel/i });

    expect(nameInput).toBeDisabled();
    expect(saveButton).toBeDisabled();
    expect(cancelButton).toBeDisabled();
  });

  it("resets form after successful save", async () => {
    const { rerender } = renderWithProviders(
      <SaveScenarioModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />
    );

    const nameInput = screen.getByLabelText(/scenario name/i);
    fireEvent.change(nameInput, { target: { value: "Test Scenario" } });

    const saveButton = screen.getByRole("button", { name: /save scenario/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalled();
    });

    // Reopen modal
    rerender(<SaveScenarioModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);

    // Name input should be empty
    expect((screen.getByLabelText(/scenario name/i) as HTMLInputElement).value).toBe("");
  });
});
