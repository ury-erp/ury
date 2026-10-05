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
    await waitFor(() => { expect(screen.getByText(/Item 1/)).toBeInTheDocument(); });
  });

  it("marks mandatory items with asterisk", async () => {
    render(<ChecklistGateDialog posProfile="POS-001" checklistType="Opening" onComplete={vi.fn()} />);
    await waitFor(() => { expect(screen.getByText(/Item 1/).textContent).toContain("*"); });
  });

  it("disables submit button until every mandatory item has a result", async () => {
    render(<ChecklistGateDialog posProfile="POS-001" checklistType="Opening" onComplete={vi.fn()} />);
    await waitFor(() => { expect(screen.getByText(/Item 1/)).toBeInTheDocument(); });
    const submitButton = screen.getByRole("button", { name: /checklist.submit/ });
    expect(submitButton).toBeDisabled();
  });

  it("enables submit button when mandatory items are answered", async () => {
    const user = userEvent.setup();
    render(<ChecklistGateDialog posProfile="POS-001" checklistType="Opening" onComplete={vi.fn()} />);
    await waitFor(() => { expect(screen.getByText(/Item 1/)).toBeInTheDocument(); });
    await user.click(screen.getAllByRole("radio", { name: "checklist.pass" })[0]);
    const submitButton = screen.getByRole("button", { name: /checklist.submit/ });
    expect(submitButton).not.toBeDisabled();
  });

  it("submits explicit PASS statuses and calls onComplete", async () => {
    submitChecklistMock.mockResolvedValue({ status: "Complete" });
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<ChecklistGateDialog posProfile="POS-001" checklistType="Opening" onComplete={onComplete} />);
    await waitFor(() => { expect(screen.getByText(/Item 1/)).toBeInTheDocument(); });
    await user.click(screen.getAllByRole("radio", { name: "checklist.pass" })[0]);
    const submitButton = screen.getByRole("button", { name: /checklist.submit/ });
    await user.click(submitButton);
    await waitFor(() => { expect(onComplete).toHaveBeenCalled(); });
    const submitted = submitChecklistMock.mock.calls[0][2];
    expect(submitted[0]).toEqual(
      expect.objectContaining({ item_label: "Item 1", status: "Passed" })
    );
  });

  it("blocks submission when FAIL has no remarks", async () => {
    const user = userEvent.setup();
    render(<ChecklistGateDialog posProfile="POS-001" checklistType="Opening" onComplete={vi.fn()} />);
    await waitFor(() => { expect(screen.getByText(/Item 1/)).toBeInTheDocument(); });
    await user.click(screen.getAllByRole("radio", { name: "checklist.fail" })[0]);
    const submitButton = screen.getByRole("button", { name: /checklist.submit/ });
    expect(submitButton).toBeDisabled();
    expect(screen.getByText("checklist.fail_remarks_required")).toBeInTheDocument();
  });

  it("allows submission when FAIL carries a remark", async () => {
    submitChecklistMock.mockResolvedValue({ status: "Complete" });
    const user = userEvent.setup();
    render(<ChecklistGateDialog posProfile="POS-001" checklistType="Opening" onComplete={vi.fn()} />);
    await waitFor(() => { expect(screen.getByText(/Item 1/)).toBeInTheDocument(); });
    await user.click(screen.getAllByRole("radio", { name: "checklist.fail" })[0]);
    await user.type(screen.getByPlaceholderText("checklist.fail_remarks_placeholder"), "Printer broken");
    const submitButton = screen.getByRole("button", { name: /checklist.submit/ });
    expect(submitButton).not.toBeDisabled();
  });

  it("prefills a previously saved FAIL result and remarks on reopen", async () => {
    getChecklistMock.mockResolvedValue({
      items: [{ item_label: "Item 1", is_mandatory: true, status: "Failed", remarks: "Printer broken" }],
      log_name: "LOG-001",
    });
    render(<ChecklistGateDialog posProfile="POS-001" checklistType="Opening" onComplete={vi.fn()} />);
    await waitFor(() => { expect(screen.getByText(/Item 1/)).toBeInTheDocument(); });
    expect(screen.getAllByRole("radio", { name: "checklist.fail" })[0]).toBeChecked();
    expect(screen.getByDisplayValue("Printer broken")).toBeInTheDocument();
    // Fail with remarks present -> submit is allowed immediately.
    expect(screen.getByRole("button", { name: /checklist.submit/ })).not.toBeDisabled();
  });


  it("accepts a FAIL with remarks and reports a failed submission notice", async () => {
    submitChecklistMock.mockResolvedValue({ status: "Failed" });
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<ChecklistGateDialog posProfile="POS-001" checklistType="Opening" onComplete={onComplete} />);
    await waitFor(() => { expect(screen.getByText(/Item 1/)).toBeInTheDocument(); });
    await user.click(screen.getAllByRole("radio", { name: "checklist.fail" })[0]);
    await user.type(screen.getByPlaceholderText("checklist.fail_remarks_placeholder"), "test");
    await user.click(screen.getByRole("button", { name: /checklist.submit/ }));
    await waitFor(() => {
      expect(screen.getByText("checklist.failed_notice")).toBeInTheDocument();
    });
    // A failed checklist is recorded but does NOT complete the gate.
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.queryByText("checklist.incomplete_error")).not.toBeInTheDocument();
  });

  it("handles empty checklists by auto-submitting", async () => {
    submitChecklistMock.mockResolvedValue({ status: "Complete" });
    const onComplete = vi.fn();
    getChecklistMock.mockResolvedValue({ items: [], log_name: "LOG-001" });
    render(<ChecklistGateDialog posProfile="POS-001" checklistType="Opening" onComplete={onComplete} />);
    await waitFor(() => { expect(onComplete).toHaveBeenCalled(); });
  });


  it("shows the blocking role message when a predecessor checklist is unfinished", async () => {
    getChecklistMock.mockResolvedValue({
      items: [],
      log_name: null,
      log_status: null,
      blockedBy: { role: "Restaurant Manager", role_label: "Restaurant Manager", goals: ["RM Opening Checklist"] },
    });
    render(<ChecklistGateDialog posProfile="POS-001" checklistType="Opening" onComplete={vi.fn()} />);
    await waitFor(() => { expect(screen.getByText("checklist.blocked_heading")).toBeInTheDocument(); });
    expect(screen.getByText("checklist.blocked_message")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /checklist.submit/ })).not.toBeInTheDocument();
  });

  it("displays title based on checklist type", async () => {
    render(<ChecklistGateDialog posProfile="POS-001" checklistType="Opening" onComplete={vi.fn()} />);
    await waitFor(() => { expect(screen.getByText("checklist.title_opening")).toBeInTheDocument(); });
  });
});
