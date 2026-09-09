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

import TabletLayout from "./TabletLayout"
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
]

const createMockOrderingSession = (overrides = {}) => ({
  context: {
    session: "test-session",
    table: "5",
    restaurant: "Test Restaurant",
    source: "Table",
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

describe("TabletLayout", () => {
  beforeEach(() => {
    useOrderingSessionMock.mockReset()
    useIdleResetMock.mockReset()
    useIdleResetMock.mockImplementation(() => {})
  })

  it("shows loading state while menu is loading", () => {
    useOrderingSessionMock.mockReturnValue(
      createMockOrderingSession({ loading: true, menu: [] })
    )

    render(<TabletLayout />)
    expect(screen.getByText("Loading menu…")).toBeInTheDocument()
  })

  it("renders the menu grid with items", () => {
    useOrderingSessionMock.mockReturnValue(
      createMockOrderingSession({ menu: mockMenuItems })
    )

    render(<TabletLayout />)
    expect(screen.getByText("Biryani")).toBeInTheDocument()
  })

  it("displays the table number in header", () => {
    useOrderingSessionMock.mockReturnValue(
      createMockOrderingSession()
    )

    render(<TabletLayout />)
    expect(screen.getByText(/Table 5/)).toBeInTheDocument()
  })

  it("displays New Order button", () => {
    useOrderingSessionMock.mockReturnValue(
      createMockOrderingSession()
    )

    render(<TabletLayout />)
    expect(screen.getByText("New Order")).toBeInTheDocument()
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

    render(<TabletLayout />)
    expect(screen.getByText("Checkout")).toBeInTheDocument()
  })

  it("resets session with confirmation dialog", async () => {
    const resetSession = vi.fn()
    useOrderingSessionMock.mockReturnValue(
      createMockOrderingSession({ resetSession })
    )

    vi.spyOn(window, "confirm").mockReturnValue(true)

    render(<TabletLayout />)
    
    const newOrderButton = screen.getByText("New Order")
    await userEvent.click(newOrderButton)

    expect(window.confirm).toHaveBeenCalled()
    expect(resetSession).toHaveBeenCalled()
  })
})
