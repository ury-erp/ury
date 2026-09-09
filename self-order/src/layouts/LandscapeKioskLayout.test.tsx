import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import LandscapeKioskLayout from "./LandscapeKioskLayout"
import type { OrderingContext, MenuItem, CustomerOrder, OrderStatus } from "../lib/api"

const useOrderingSessionMock = vi.fn()
const useIdleResetMock = vi.fn()

vi.mock("../hooks/useOrderingSession", () => ({
  useOrderingSession: () => useOrderingSessionMock(),
}))

vi.mock("../hooks/useIdleReset", () => ({
  useIdleReset: (callback: Function, timeout: number) => useIdleResetMock(callback, timeout),
}))

vi.mock("@ury/ui", () => ({
  Dialog: ({ open, children, onOpenChange }: any) =>
    open ? (
      <div data-testid="dialog" onClick={() => onOpenChange?.(false)}>
        {children}
      </div>
    ) : null,
  DialogContent: ({ children, onClose }: any) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}))

vi.mock("./shared/CartPanel", () => ({
  default: ({ onIncrement, onSubmit }: any) => (
    <div data-testid="cart-panel">
      <button onClick={onSubmit}>Submit Order</button>
    </div>
  ),
}))

vi.mock("./shared/CartPage", () => ({
  default: ({ onBack, onCheckout }: any) => (
    <div data-testid="cart-page">
      <button onClick={onBack}>Back</button>
      <button onClick={onCheckout}>Checkout</button>
    </div>
  ),
}))

vi.mock("./shared/CategoryTabs", () => ({
  default: ({ categories, onSelect }: any) => (
    <div data-testid="category-tabs">
      {categories.map((cat: any) => (
        <button key={cat.course} onClick={() => onSelect(cat.course)}>
          {cat.course_label}
        </button>
      ))}
    </div>
  ),
}))

vi.mock("./shared/SearchBar", () => ({
  default: ({ onChange }: any) => (
    <input
      data-testid="search-bar"
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search menu..."
    />
  ),
}))

vi.mock("./shared/MenuGrid", () => ({
  default: ({ menu, onItemClick }: any) => (
    <div data-testid="menu-grid">
      {menu.map((item: any) => (
        <button key={item.item} onClick={() => onItemClick(item)}>
          {item.item_name}
        </button>
      ))}
    </div>
  ),
}))

vi.mock("./shared/CheckoutScreen", () => ({
  default: () => <div data-testid="checkout-screen">Checkout Screen</div>,
}))

vi.mock("./shared/OrderStatusScreen", () => ({
  default: ({ onDone, onAddMore }: any) => (
    <div data-testid="order-status-screen">
      {onDone && <button onClick={onDone}>Done</button>}
      {onAddMore && <button onClick={onAddMore}>Add More</button>}
    </div>
  ),
}))

vi.mock("./shared/ProductDetail", () => ({
  default: ({ onBack }: any) => (
    <div data-testid="product-detail">
      <button onClick={onBack}>Back</button>
    </div>
  ),
}))

describe("LandscapeKioskLayout", () => {
  const baseContext: OrderingContext = {
    session: "test-session",
    source: "Device",
    restaurant: "Test Restaurant",
    table: "5",
    layout: "Landscape Kiosk",
    session_idle_timeout_minutes: 30,
    capabilities: {
      product_detail_enabled: false,
      show_item_images: false,
      show_item_descriptions: false,
      item_notes_enabled: false,
      request_bill_enabled: false,
      customer_payment_enabled: false,
      payment_link_enabled: false,
      pay_at_counter_enabled: false,
      add_to_running_table_enabled: false,
    },
  }

  const sampleMenu: MenuItem[] = [
    {
      item: "ITEM-001",
      item_name: "Burger",
      rate: 250,
      special_dish: 0,
      disabled: 0,
      item_image: null,
      course: "Main",
      course_label: "Main Course",
    },
  ]

  const mockOrder: CustomerOrder = {
    invoice: "INV-001",
    items: [],
    grand_total: 0,
    billed: false,
    pickup_code: null,
  }

  const mockOrderStatus: OrderStatus = {
    session_status: "open",
    invoice: "INV-001",
    submitted: true,
    billed: false,
  }

  const defaultSessionMock = {
    context: baseContext,
    menu: sampleMenu,
    order: mockOrder,
    orderStatus: mockOrderStatus,
    cart: {},
    loading: false,
    submitting: false,
    error: null,
    billRequested: false,
    paymentRequest: null,
    payingOnline: false,
    screen: "menu" as const,
    detailItemCode: null,
    addToCart: vi.fn(),
    decrementCart: vi.fn(),
    submitCart: vi.fn().mockResolvedValue(true),
    handleRequestBill: vi.fn(),
    payOnline: vi.fn(),
    resetSession: vi.fn(),
    goToMenu: vi.fn(),
    goToDetail: vi.fn(),
    goToCart: vi.fn(),
    goToCheckout: vi.fn(),
    goToStatus: vi.fn(),
    cartItems: [],
    cartCount: 0,
    cartTotal: 0,
  }

  beforeEach(() => {
    useOrderingSessionMock.mockReset()
    useIdleResetMock.mockReset()
    useOrderingSessionMock.mockReturnValue(defaultSessionMock)
  })

  it("shows loading state", () => {
    useOrderingSessionMock.mockReturnValue({
      ...defaultSessionMock,
      loading: true,
    })

    render(<LandscapeKioskLayout />)

    expect(screen.getByText("Loading menu…")).toBeInTheDocument()
  })

  it("shows error state when context is missing", () => {
    useOrderingSessionMock.mockReturnValue({
      ...defaultSessionMock,
      loading: false,
      context: null,
      error: "Cannot load menu",
    })

    render(<LandscapeKioskLayout />)

    expect(screen.getByText("Cannot load menu")).toBeInTheDocument()
  })

  it("renders menu screen with product grid", async () => {
    render(<LandscapeKioskLayout />)

    await waitFor(() => {
      expect(screen.getByTestId("menu-grid")).toBeInTheDocument()
      expect(screen.getByTestId("cart-panel")).toBeInTheDocument()
    })
  })

  it("displays table number in header", async () => {
    render(<LandscapeKioskLayout />)

    await waitFor(() => {
      expect(screen.getByText("Table 5")).toBeInTheDocument()
    })
  })

  it("displays pickup label when no table", async () => {
    useOrderingSessionMock.mockReturnValue({
      ...defaultSessionMock,
      context: { ...baseContext, table: null },
    })

    render(<LandscapeKioskLayout />)

    await waitFor(() => {
      expect(screen.getByText("Order for Pickup")).toBeInTheDocument()
    })
  })

  it("renders cart page when screen is cart", async () => {
    useOrderingSessionMock.mockReturnValue({
      ...defaultSessionMock,
      screen: "cart" as const,
    })

    render(<LandscapeKioskLayout />)

    await waitFor(() => {
      expect(screen.getByTestId("cart-page")).toBeInTheDocument()
    })
  })

  it("renders checkout screen when screen is checkout", async () => {
    useOrderingSessionMock.mockReturnValue({
      ...defaultSessionMock,
      screen: "checkout" as const,
    })

    render(<LandscapeKioskLayout />)

    await waitFor(() => {
      expect(screen.getByTestId("checkout-screen")).toBeInTheDocument()
    })
  })

  it("renders status screen when screen is status", async () => {
    useOrderingSessionMock.mockReturnValue({
      ...defaultSessionMock,
      screen: "status" as const,
    })

    render(<LandscapeKioskLayout />)

    await waitFor(() => {
      expect(screen.getByTestId("order-status-screen")).toBeInTheDocument()
    })
  })

  it("shows New Order button on all screens", async () => {
    render(<LandscapeKioskLayout />)

    await waitFor(() => {
      expect(screen.getByText("New Order")).toBeInTheDocument()
    })
  })

  it("calls resetSession when New Order is confirmed", async () => {
    const resetSession = vi.fn()
    useOrderingSessionMock.mockReturnValue({
      ...defaultSessionMock,
      resetSession,
    })

    window.confirm = vi.fn(() => true)

    render(<LandscapeKioskLayout />)

    await waitFor(() => {
      fireEvent.click(screen.getByText("New Order"))
    })

    await waitFor(() => {
      expect(resetSession).toHaveBeenCalled()
    })
  })

  it("does not call resetSession when New Order is cancelled", async () => {
    const resetSession = vi.fn()
    useOrderingSessionMock.mockReturnValue({
      ...defaultSessionMock,
      resetSession,
    })

    window.confirm = vi.fn(() => false)

    render(<LandscapeKioskLayout />)

    await waitFor(() => {
      fireEvent.click(screen.getByText("New Order"))
    })

    expect(resetSession).not.toHaveBeenCalled()
  })

  it("registers idle reset hook", () => {
    render(<LandscapeKioskLayout />)

    expect(useIdleResetMock).toHaveBeenCalled()
  })

  it("does not call resetSession during idle warning when submitting", () => {
    const mockResetSession = vi.fn()
    useOrderingSessionMock.mockReturnValue({
      ...defaultSessionMock,
      submitting: true,
      resetSession: mockResetSession,
    })

    let idleCallback: (() => void) | null = null
    useIdleResetMock.mockImplementation((callback: () => void) => {
      idleCallback = callback
    })

    render(<LandscapeKioskLayout />)

    // Trigger idle callback - should do nothing when submitting
    if (idleCallback) {
      idleCallback()
    }

    // Warning should not appear when submitting
    expect(screen.queryByTestId("dialog")).not.toBeInTheDocument()
  })
})
