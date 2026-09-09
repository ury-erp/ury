import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const useOrderingSessionMock = vi.fn()
const useIdleResetMock = vi.fn()

vi.mock("../hooks/useOrderingSession", async () => {
  const actual = await vi.importActual<typeof import("../hooks/useOrderingSession")>("../hooks/useOrderingSession")
  return {
    ...actual,
    useOrderingSession: (...args: any[]) => useOrderingSessionMock(...args),
  }
})

vi.mock("../hooks/useIdleReset", async () => {
  const actual = await vi.importActual<typeof import("../hooks/useIdleReset")>("../hooks/useIdleReset")
  return {
    ...actual,
    useIdleReset: (...args: any[]) => useIdleResetMock(...args),
  }
})

import PortraitKioskLayout from "./PortraitKioskLayout"
import type { MenuItem } from "../lib/api"

const mockMenuItems: MenuItem[] = [
  {
    item: "ITEM-001",
    item_name: "Biryani",
    rate: 250,
    special_dish: 0,
    disabled: 0,
    item_image: null,
    course: "RICE",
    course_label: "Rice Dishes",
  },
  {
    item: "ITEM-002",
    item_name: "Naan",
    rate: 50,
    special_dish: 0,
    disabled: 0,
    item_image: null,
    course: "BREAD",
    course_label: "Breads",
  },
]

const createMockOrderingSession = (overrides = {}) => ({
  context: {
    session: "test-session",
    table: null,
    restaurant: "Test Restaurant",
    source: "QR Pickup",
    capabilities: {
      product_detail_enabled: true,
      show_item_images: false,
      customer_payment_enabled: true,
      pay_at_counter_enabled: true,
      request_bill_enabled: false,
      add_to_running_table_enabled: true,
      item_notes_enabled: false,
    },
    session_idle_timeout_minutes: 30,
  },
  menu: mockMenuItems,
  order: null,
  orderStatus: null,
  cart: {},
  loading: false,
  submitting: false,
  error: null,
  billRequested: false,
  payingOnline: false,
  paymentRequest: null,
  screen: "menu" as const,
  detailItemCode: null,
  addToCart: vi.fn(),
  decrementCart: vi.fn(),
  submitCart: vi.fn(),
  handleRequestBill: vi.fn(),
  payOnline: vi.fn(),
  resetSession: vi.fn(),
  cartItems: [],
  cartCount: 0,
  cartTotal: 0,
  goToMenu: vi.fn(),
  goToDetail: vi.fn(),
  goToCheckout: vi.fn(),
  goToStatus: vi.fn(),
  ...overrides,
})

describe("PortraitKioskLayout", () => {
  beforeEach(() => {
    useOrderingSessionMock.mockReset()
    useIdleResetMock.mockReset()
    useIdleResetMock.mockImplementation(() => {})
  })

  it("shows loading state while menu is loading", () => {
    useOrderingSessionMock.mockReturnValue(
      createMockOrderingSession({ loading: true, menu: [] })
    )

    render(<PortraitKioskLayout />)
    expect(screen.getByText("Loading menu…")).toBeInTheDocument()
  })

  it("shows error state when no context and error exists", () => {
    useOrderingSessionMock.mockReturnValue(
      createMockOrderingSession({ 
        context: null, 
        error: "Failed to load" 
      })
    )

    render(<PortraitKioskLayout />)
    expect(screen.getByText("Failed to load")).toBeInTheDocument()
  })

  it("renders menu grid with items", () => {
    useOrderingSessionMock.mockReturnValue(
      createMockOrderingSession({ menu: mockMenuItems })
    )

    render(<PortraitKioskLayout />)
    expect(screen.getByText("Biryani")).toBeInTheDocument()
    expect(screen.getByText("Naan")).toBeInTheDocument()
  })

  it("displays Order for Pickup in header when no table", () => {
    useOrderingSessionMock.mockReturnValue(
      createMockOrderingSession()
    )

    render(<PortraitKioskLayout />)
    expect(screen.getByText("Order for Pickup")).toBeInTheDocument()
  })

  it("displays table number when set", () => {
    useOrderingSessionMock.mockReturnValue(
      createMockOrderingSession({
        context: {
          ...createMockOrderingSession().context,
          table: "T5",
        }
      })
    )

    render(<PortraitKioskLayout />)
    expect(screen.getByText(/Table T5/)).toBeInTheDocument()
  })

  it("displays New Order button", () => {
    useOrderingSessionMock.mockReturnValue(
      createMockOrderingSession()
    )

    render(<PortraitKioskLayout />)
    expect(screen.getByText("New Order")).toBeInTheDocument()
  })

  it("shows All Items category button", () => {
    useOrderingSessionMock.mockReturnValue(
      createMockOrderingSession({ menu: mockMenuItems })
    )

    render(<PortraitKioskLayout />)
    expect(screen.getByText("All Items")).toBeInTheDocument()
  })

  it("shows category buttons from menu", () => {
    useOrderingSessionMock.mockReturnValue(
      createMockOrderingSession({ menu: mockMenuItems })
    )

    render(<PortraitKioskLayout />)
    expect(screen.getByText("Rice Dishes")).toBeInTheDocument()
    expect(screen.getByText("Breads")).toBeInTheDocument()
  })

  it("shows cart bar when items in cart", () => {
    useOrderingSessionMock.mockReturnValue(
      createMockOrderingSession({ 
        cartCount: 2,
        cartTotal: 300
      })
    )

    render(<PortraitKioskLayout />)
    expect(screen.getByText(/2 items/)).toBeInTheDocument()
  })

  it("hides cart bar when no items in cart", () => {
    useOrderingSessionMock.mockReturnValue(
      createMockOrderingSession({ 
        cartCount: 0,
        cartTotal: 0
      })
    )

    render(<PortraitKioskLayout />)
    expect(screen.queryByText(/items/)).not.toBeInTheDocument()
  })

  it("shows checkout screen when screen === checkout", () => {
    useOrderingSessionMock.mockReturnValue(
      createMockOrderingSession({ 
        screen: "checkout" as const,
        cartItems: [
          { item: mockMenuItems[0], qty: 1 }
        ],
        cartCount: 1,
        cartTotal: 250
      })
    )

    render(<PortraitKioskLayout />)
    expect(screen.getByText(/Checkout|Order for Pickup/)).toBeInTheDocument()
  })

  it("shows status screen when screen === status", () => {
    useOrderingSessionMock.mockReturnValue(
      createMockOrderingSession({ 
        screen: "status" as const,
        order: {
          name: "ORD-001",
          items: [],
          grand_total: 250,
          pickup_code: "ABC123",
          order_status: "Received",
        }
      })
    )

    render(<PortraitKioskLayout />)
    expect(screen.getByText("Order for Pickup")).toBeInTheDocument()
  })

  it("resets session with confirmation", async () => {
    const resetSession = vi.fn()
    useOrderingSessionMock.mockReturnValue(
      createMockOrderingSession({ resetSession })
    )

    vi.spyOn(window, "confirm").mockReturnValue(true)

    render(<PortraitKioskLayout />)
    
    const newOrderButton = screen.getByText("New Order")
    await userEvent.click(newOrderButton)

    expect(window.confirm).toHaveBeenCalled()
    expect(resetSession).toHaveBeenCalled()
  })

  it("cancels reset when user declines", async () => {
    const resetSession = vi.fn()
    useOrderingSessionMock.mockReturnValue(
      createMockOrderingSession({ resetSession })
    )

    vi.spyOn(window, "confirm").mockReturnValue(false)

    render(<PortraitKioskLayout />)
    
    const newOrderButton = screen.getByText("New Order")
    await userEvent.click(newOrderButton)

    expect(resetSession).not.toHaveBeenCalled()
  })
})
