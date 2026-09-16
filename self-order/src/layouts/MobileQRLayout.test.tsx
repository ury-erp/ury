import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import MobileQRLayout from "./MobileQRLayout"
import type { OrderingContext, MenuItem, CustomerOrder, OrderStatus } from "../lib/api"

const useOrderingSessionMock = vi.fn()
const useIdleResetMock = vi.fn()

vi.mock("../hooks/useOrderingSession", () => ({
  useOrderingSession: () => useOrderingSessionMock(),
}))

vi.mock("../hooks/useIdleReset", () => ({
  useIdleReset: (callback: Function, timeout: number) => useIdleResetMock(callback, timeout),
}))

vi.mock("./shared/CategoryTabs", () => ({
  default: ({ categories, activeCourse, onSelect }: any) => (
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
  default: ({ value, onChange }: any) => (
    <input
      data-testid="search-bar"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search menu..."
    />
  ),
}))

vi.mock("./shared/ProductCard", () => ({
  default: ({ item, onClick }: any) => (
    <button onClick={onClick} data-testid={`product-${item.item}`}>
      {item.item_name}
    </button>
  ),
}))

vi.mock("./shared/ProductDetail", () => ({
  default: ({ itemCode, onBack }: any) => (
    <div data-testid="product-detail">
      <div>Detail for {itemCode}</div>
      <button onClick={onBack}>Back</button>
    </div>
  ),
}))

vi.mock("./shared/CartPage", () => ({
  default: ({ onBack, onCheckout }: any) => (
    <div data-testid="cart-page">
      <button onClick={onBack}>Back to menu</button>
      <button onClick={onCheckout}>Checkout</button>
    </div>
  ),
}))

vi.mock("./shared/CheckoutScreen", () => ({
  default: ({ onSubmitCart }: any) => (
    <div data-testid="checkout-screen">
      <button onClick={onSubmitCart}>Submit</button>
    </div>
  ),
}))

vi.mock("./shared/OrderStatusScreen", () => ({
  default: ({ onAddMore, onDone }: any) => (
    <div data-testid="order-status-screen">
      {onAddMore && <button onClick={onAddMore}>Add more</button>}
      {onDone && <button onClick={onDone}>Done</button>}
    </div>
  ),
}))

describe("MobileQRLayout", () => {
  const baseContext: OrderingContext = {
    session: "test-session",
    source: "QR",
    restaurant: "Test Restaurant",
    table: "5",
    layout: "Mobile",
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
      item: "PIZZA-001",
      item_name: "Margherita",
      rate: 350,
      special_dish: 0,
      disabled: 0,
      item_image: null,
      course: "Main",
      course_label: "Main Course",
    },
    {
      item: "PIZZA-002",
      item_name: "Pepperoni",
      rate: 450,
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
    open_requests: [],
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
    cartItems: [],
    cartCount: 0,
    cartTotal: 0,
    goToMenu: vi.fn(),
    goToDetail: vi.fn(),
    goToCart: vi.fn(),
    goToCheckout: vi.fn(),
    goToStatus: vi.fn(),
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

    render(<MobileQRLayout />)

    expect(screen.getByText("Loading menu…")).toBeInTheDocument()
  })

  it("shows error state when context is missing", () => {
    useOrderingSessionMock.mockReturnValue({
      ...defaultSessionMock,
      loading: false,
      context: null,
      error: "Custom error message",
    })

    render(<MobileQRLayout />)

    expect(screen.getByText("Custom error message")).toBeInTheDocument()
  })

  it("renders menu screen by default", async () => {
    render(<MobileQRLayout />)

    await waitFor(() => {
      expect(screen.getByTestId("search-bar")).toBeInTheDocument()
      expect(screen.getByTestId("product-PIZZA-001")).toBeInTheDocument()
      expect(screen.getByTestId("product-PIZZA-002")).toBeInTheDocument()
    })
  })

  it("displays table number in header for dine-in", async () => {
    render(<MobileQRLayout />)

    await waitFor(() => {
      expect(screen.getByText("Table 5")).toBeInTheDocument()
    })
  })

  it("displays pickup label for QR pickup source", async () => {
    useOrderingSessionMock.mockReturnValue({
      ...defaultSessionMock,
      context: { ...baseContext, source: "QR Pickup", table: null },
    })

    render(<MobileQRLayout />)

    await waitFor(() => {
      expect(screen.getByText("Order for Pickup")).toBeInTheDocument()
    })
  })

  it("renders cart page when screen is cart", async () => {
    useOrderingSessionMock.mockReturnValue({
      ...defaultSessionMock,
      screen: "cart" as const,
    })

    render(<MobileQRLayout />)

    await waitFor(() => {
      expect(screen.getByTestId("cart-page")).toBeInTheDocument()
    })
  })

  it("renders checkout screen when screen is checkout", async () => {
    useOrderingSessionMock.mockReturnValue({
      ...defaultSessionMock,
      screen: "checkout" as const,
    })

    render(<MobileQRLayout />)

    await waitFor(() => {
      expect(screen.getByTestId("checkout-screen")).toBeInTheDocument()
    })
  })

  it("renders status screen when screen is status", async () => {
    useOrderingSessionMock.mockReturnValue({
      ...defaultSessionMock,
      screen: "status" as const,
    })

    render(<MobileQRLayout />)

    await waitFor(() => {
      expect(screen.getByTestId("order-status-screen")).toBeInTheDocument()
    })
  })

  it("renders detail screen when screen is detail", async () => {
    useOrderingSessionMock.mockReturnValue({
      ...defaultSessionMock,
      screen: "detail" as const,
      detailItemCode: "PIZZA-001",
    })

    render(<MobileQRLayout />)

    await waitFor(() => {
      expect(screen.getByTestId("product-detail")).toBeInTheDocument()
    })
  })

  it("shows Start Over button on menu", async () => {
    render(<MobileQRLayout />)

    await waitFor(() => {
      expect(screen.getByText("Start Over")).toBeInTheDocument()
    })
  })

  it("shows cart summary when order has items", async () => {
    const orderWithItems: CustomerOrder = {
      invoice: "INV-001",
      table: "5",
      items: [
        {
          item_code: "PIZZA-001",
          item_name: "Margherita",
          qty: 2,
          comment: null,
          rate: 350,
          amount: 700,
        },
      ],
      grand_total: 700,
      billed: false,
      pickup_code: null,
    }

    useOrderingSessionMock.mockReturnValue({
      ...defaultSessionMock,
      order: orderWithItems,
    })

    render(<MobileQRLayout />)

    await waitFor(() => {
      expect(screen.getByText("Your order so far")).toBeInTheDocument()
      expect(screen.getByText("Margherita × 2")).toBeInTheDocument()
    })
  })

  it("shows View Cart button with count and total when items in cart", async () => {
    useOrderingSessionMock.mockReturnValue({
      ...defaultSessionMock,
      cartCount: 3,
      cartTotal: 1200,
    })

    render(<MobileQRLayout />)

    await waitFor(() => {
      expect(screen.getByText("View Cart (3 items) • 1200")).toBeInTheDocument()
    })
  })

  it("does not show View Cart button when cart is empty", async () => {
    render(<MobileQRLayout />)

    await waitFor(() => {
      expect(screen.queryByText(/View Cart/)).not.toBeInTheDocument()
    })
  })

  it("calls resetSession when Start Over is confirmed", async () => {
    const resetSession = vi.fn()
    useOrderingSessionMock.mockReturnValue({
      ...defaultSessionMock,
      resetSession,
    })

    window.confirm = vi.fn(() => true)

    render(<MobileQRLayout />)

    await waitFor(() => {
      fireEvent.click(screen.getByText("Start Over"))
    })

    await waitFor(() => {
      expect(resetSession).toHaveBeenCalled()
    })
  })

  it("does not call resetSession when Start Over is cancelled", async () => {
    const resetSession = vi.fn()
    useOrderingSessionMock.mockReturnValue({
      ...defaultSessionMock,
      resetSession,
    })

    window.confirm = vi.fn(() => false)

    render(<MobileQRLayout />)

    await waitFor(() => {
      fireEvent.click(screen.getByText("Start Over"))
    })

    expect(resetSession).not.toHaveBeenCalled()
  })

  it("registers idle reset hook on mount", () => {
    render(<MobileQRLayout />)

    expect(useIdleResetMock).toHaveBeenCalled()
  })
})
