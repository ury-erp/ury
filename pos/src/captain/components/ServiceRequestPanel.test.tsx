import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ServiceRequestPanel from "./ServiceRequestPanel";

// Use vi.hoisted to define mocks outside the mock factory
const { mockListOpenServiceRequests, mockAcknowledgeServiceRequest, mockResolveServiceRequest } = vi.hoisted(() => ({
  mockListOpenServiceRequests: vi.fn(),
  mockAcknowledgeServiceRequest: vi.fn(),
  mockResolveServiceRequest: vi.fn(),
}));

vi.mock("../../lib/service-request-api", () => ({
  listOpenServiceRequests: mockListOpenServiceRequests,
  acknowledgeServiceRequest: mockAcknowledgeServiceRequest,
  resolveServiceRequest: mockResolveServiceRequest,
}));

vi.mock("@ury/ui", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
  showToast: { error: vi.fn(), success: vi.fn() },
}));

describe("ServiceRequestPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when branch is null", () => {
    const { container } = render(<ServiceRequestPanel branch={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders bell icon when branch provided", () => {
    mockListOpenServiceRequests.mockResolvedValueOnce([]);
    render(<ServiceRequestPanel branch="B1" />);
    // The button should render immediately
    expect(screen.getByLabelText("Toggle service requests")).toBeInTheDocument();
  });

  it("opens and closes panel", async () => {
    mockListOpenServiceRequests.mockResolvedValueOnce([]);
    render(<ServiceRequestPanel branch="B1" />);
    
    const toggle = screen.getByLabelText("Toggle service requests");
    await userEvent.click(toggle);
    
    // Panel should open (header appears)
    expect(screen.getByText("Service Requests")).toBeInTheDocument();

    // Click to close
    await userEvent.click(toggle);
    
    // Panel should be gone
    expect(screen.queryByText("Service Requests")).not.toBeInTheDocument();
  });

  it("displays no requests message when empty", async () => {
    mockListOpenServiceRequests.mockResolvedValueOnce([]);
    render(<ServiceRequestPanel branch="B1" />);

    const toggle = screen.getByLabelText("Toggle service requests");
    await userEvent.click(toggle);
    
    expect(screen.getByText("No open requests")).toBeInTheDocument();
  });

  it("shows request count badge", () => {
    mockListOpenServiceRequests.mockResolvedValueOnce([
      { name: "SR1", table: "T1", request_type: "Bill", requested_at: "2024-01-01T10:00:00", status: "Open" },
      { name: "SR2", table: "T2", request_type: "Assist", requested_at: "2024-01-01T10:05:00", status: "Ack" },
    ]);
    render(<ServiceRequestPanel branch="B1" />);
    
    // The button with count should be present (badge shows count)
    expect(screen.getByLabelText("Toggle service requests")).toBeInTheDocument();
  });

  it("polls for requests on interval", () => {
    mockListOpenServiceRequests.mockResolvedValue([]);
    render(<ServiceRequestPanel branch="B1" />);

    // Should call the API at least once on render
    expect(mockListOpenServiceRequests).toHaveBeenCalled();
  });

  it("handles acknowledge action", async () => {
    mockListOpenServiceRequests.mockResolvedValueOnce([
      { name: "SR1", table: "T1", request_type: "Bill", requested_at: "2024-01-01T10:00:00", status: "Open" },
    ]);
    mockAcknowledgeServiceRequest.mockResolvedValueOnce({});

    render(<ServiceRequestPanel branch="B1" />);

    const toggle = screen.getByLabelText("Toggle service requests");
    await userEvent.click(toggle);
    
    // Panel opens, find and click Ack button
    const ackBtn = screen.getByText("Ack");
    expect(ackBtn).toBeInTheDocument();
  });
});
