import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ServiceRequestPanel from "./ServiceRequestPanel";

const mockListOpenServiceRequests = vi.fn();
const mockAcknowledgeServiceRequest = vi.fn();
const mockResolveServiceRequest = vi.fn();

vi.mock("../../lib/service-request-api", () => ({
  listOpenServiceRequests: (...args: any[]) => mockListOpenServiceRequests(...args),
  acknowledgeServiceRequest: (...args: any[]) => mockAcknowledgeServiceRequest(...args),
  resolveServiceRequest: (...args: any[]) => mockResolveServiceRequest(...args),
}));

vi.mock("@ury/ui", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  showToast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe("ServiceRequestPanel", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("returns null when branch is not provided", () => {
    const { container } = render(<ServiceRequestPanel branch={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders bell button when branch is provided", () => {
    mockListOpenServiceRequests.mockResolvedValue([]);
    
    render(<ServiceRequestPanel branch="Kozhikode" />);
    
    const bellButton = screen.queryByRole("button", { name: /toggle service requests/i });
    expect(bellButton).toBeInTheDocument();
  });

  it("calls API to list requests on mount", async () => {
    mockListOpenServiceRequests.mockResolvedValue([]);
    
    render(<ServiceRequestPanel branch="Kozhikode" />);
    
    // Give it a moment for the effect to run
    await new Promise(resolve => setTimeout(resolve, 100));
    
    expect(mockListOpenServiceRequests).toHaveBeenCalledWith("Kozhikode");
  });

  it("renders component without crashing", () => {
    mockListOpenServiceRequests.mockResolvedValue([]);
    
    const { container } = render(<ServiceRequestPanel branch="Kozhikode" />);
    expect(container).toBeTruthy();
  });
});
