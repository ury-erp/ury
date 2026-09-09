import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChecklistGateDialog from "./ChecklistGateDialog";

const getChecklistMock = vi.fn();
const submitChecklistMock = vi.fn();
vi.mock("../../../lib/pos/checklist-api", () => ({ getChecklist: (...a: any) => getChecklistMock(...a), submitChecklist: (...a: any) => submitChecklistMock(...a) }));
vi.mock("../i18n", () => ({ t: (key: string) => key }));

const mockChecklistItems = [
  { item_label: "Item 1", is_mandatory: true },
  { item_label: "Item 2", is_mandatory: false },
];

describe("ChecklistGateDialog", () => {
  beforeEach(() => { cleanup(); vi.clearAllMocks(); getChecklistMock.mockResolvedValue({ items: mockChecklistItems, log_name: "LOG-001" }); });
  
  it("loads and displays checklist items", async () => {
    render(<ChecklistGateDialog posProfile="POS-001" checklistType="Opening" onComplete={vi.fn()} />);
    await waitFor(() => { expect(screen.getByText("Item 1")).toBeInTheDocument(); });
  });

  it("marks mandatory items with asterisk", async () => {
    render(<ChecklistGateDialog posProfile="POS-001" checklistType="Opening" onComplete={vi.fn()} />);
    await waitFor(() => { expect(screen.getByText(/Item 1/).textContent).toContain("*"); });
  });

  it("disables submit button when mandatory items unchecked", async () => {
    render(<ChecklistGateDialog posProfile="POS-001" checklistType="Opening" onComplete={vi.fn()} />);
    await waitFor(() => { expect(screen.getByText("Item 1")).toBeInTheDocument(); });
    const submitButton = screen.getByRole("button", { name: /checklist.submit/ });
    expect(submitButton).toBeDisabled();
  });

  it("enables submit button when mandatory item is checked", async () => {
    const user = userEvent.setup();
    render(<ChecklistGateDialog posProfile="POS-001" checklistType="Opening" onComplete={vi.fn()} />);
    await waitFor(() => { expect(screen.getByText("Item 1")).toBeInTheDocument(); });
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);
    const submitButton = screen.getByRole("button", { name: /checklist.submit/ });
    expect(submitButton).not.toBeDisabled();
  });

  it("submits checklist and calls onComplete", async () => {
    submitChecklistMock.mockResolvedValue({ status: "Complete" });
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<ChecklistGateDialog posProfile="POS-001" checklistType="Opening" onComplete={onComplete} />);
    await waitFor(() => { expect(screen.getByText("Item 1")).toBeInTheDocument(); });
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);
    const submitButton = screen.getByRole("button", { name: /checklist.submit/ });
    await user.click(submitButton);
    await waitFor(() => { expect(onComplete).toHaveBeenCalled(); });
  });

  it("handles empty checklists by auto-submitting", async () => {
    submitChecklistMock.mockResolvedValue({ status: "Complete" });
    const onComplete = vi.fn();
    getChecklistMock.mockResolvedValue({ items: [], log_name: "LOG-001" });
    render(<ChecklistGateDialog posProfile="POS-001" checklistType="Opening" onComplete={onComplete} />);
    await waitFor(() => { expect(onComplete).toHaveBeenCalled(); });
  });

  it("displays title based on checklist type", async () => {
    render(<ChecklistGateDialog posProfile="POS-001" checklistType="Opening" onComplete={vi.fn()} />);
    await waitFor(() => { expect(screen.getByText("checklist.title_opening")).toBeInTheDocument(); });
  });
});
