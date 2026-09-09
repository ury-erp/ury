import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../i18n", () => ({
  t: (key) => key,
}));

vi.mock("@ury/ui", () => ({
  Spinner: ({ message }) => <div>{message}</div>,
  cn: (...args) => args.filter(Boolean).join(" "),
}));

vi.mock("lucide-react", () => ({
  Star: () => <span>Star</span>,
  TrendingUp: () => <span>TrendingUp</span>,
  Bell: () => <span>Bell</span>,
  Users: () => <span>Users</span>,
  LogOut: () => <span>LogOut</span>,
  Activity: () => <span>Activity</span>,
  Gauge: () => <span>Gauge</span>,
  Sparkles: () => <span>Sparkles</span>,
  PackageSearch: () => <span>PackageSearch</span>,
  ArrowRight: () => <span>ArrowRight</span>,
  MessageCircle: () => <span>MessageCircle</span>,
  X: () => <span>X</span>,
  Send: () => <span>Send</span>,
  Utensils: () => <span>Utensils</span>,
  Truck: () => <span>Truck</span>,
  ShoppingBag: () => <span>ShoppingBag</span>,
  Phone: () => <span>Phone</span>,
  Globe: () => <span>Globe</span>,
  CheckCircle: () => <span>CheckCircle</span>,
  XCircle: () => <span>XCircle</span>,
  Info: () => <span>Info</span>,
  AlertTriangle: () => <span>AlertTriangle</span>,
}));

vi.mock("../components/Sidebar", () => ({
  default: ({ disabled }) => <div>Sidebar</div>,
}));

vi.mock("../components/OrderPanel", () => ({
  default: () => <div>OrderPanel</div>,
}));

vi.mock("../components/ProductDialog", () => ({
  default: ({ onClose }) => <div>ProductDialog</div>,
}));

vi.mock("../components/MenuList", () => ({
  default: ({ onItemClick }) => <div>MenuList</div>,
}));

vi.mock("../components/InitialLoader", () => ({
  default: () => <div>InitialLoader</div>,
}));

vi.mock("../store/pos-store");

import POS from "./POS";
import * as posStore from "../store/pos-store";

describe("POS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    vi.mocked(posStore.usePOSStore).mockReturnValue({
      quickFilter: "all",
      setQuickFilter: vi.fn(),
      setSelectedItem: vi.fn(),
      addToOrder: vi.fn(),
      loading: false,
      error: null,
      isMenuInteractionDisabled: () => false,
      isInitializing: false,
    } as any);
  });

  it("renders main POS layout", () => {
    render(<POS />);

    expect(screen.getByText("Sidebar")).toBeInTheDocument();
    expect(screen.getByText("OrderPanel")).toBeInTheDocument();
    expect(screen.getByText("MenuList")).toBeInTheDocument();
  });

  it("renders quick filter buttons", () => {
    render(<POS />);

    expect(screen.getByText("common.all")).toBeInTheDocument();
    expect(screen.getByText("menu.special_items")).toBeInTheDocument();
  });

  it("renders all components", () => {
    render(<POS />);

    expect(screen.getByText("Sidebar")).toBeInTheDocument();
    expect(screen.getByText("OrderPanel")).toBeInTheDocument();
    expect(screen.getByText("MenuList")).toBeInTheDocument();
  });

  it("shows InitialLoader when initializing", () => {
    vi.mocked(posStore.usePOSStore).mockReturnValue({
      quickFilter: "all",
      setQuickFilter: vi.fn(),
      setSelectedItem: vi.fn(),
      addToOrder: vi.fn(),
      loading: false,
      error: null,
      isMenuInteractionDisabled: () => false,
      isInitializing: true,
    } as any);
    
    render(<POS />);
    
    expect(screen.getByText("InitialLoader")).toBeInTheDocument();
  });

  it("shows error state", () => {
    vi.mocked(posStore.usePOSStore).mockReturnValue({
      quickFilter: "all",
      setQuickFilter: vi.fn(),
      setSelectedItem: vi.fn(),
      addToOrder: vi.fn(),
      loading: false,
      error: "Failed to load POS",
      isMenuInteractionDisabled: () => false,
      isInitializing: false,
    } as any);

    render(<POS />);
    
    expect(screen.getByText(/Retry/)).toBeInTheDocument();
  });

  it("shows loading state", () => {
    vi.mocked(posStore.usePOSStore).mockReturnValue({
      quickFilter: "all",
      setQuickFilter: vi.fn(),
      setSelectedItem: vi.fn(),
      addToOrder: vi.fn(),
      loading: true,
      error: null,
      isMenuInteractionDisabled: () => false,
      isInitializing: false,
    } as any);

    render(<POS />);
    
    expect(screen.getByText("common.loading_menu_items")).toBeInTheDocument();
  });

  it("has proper flex layout", () => {
    const { container } = render(<POS />);
    const mainDiv = container.querySelector("div[class*=\"flex\"]");
    expect(mainDiv).toBeTruthy();
  });
});
