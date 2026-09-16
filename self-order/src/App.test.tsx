import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import App from "./App"
import type { OrderingContext } from "./lib/api"

const useDeviceBootstrapMock = vi.fn()

vi.mock("./hooks/useDeviceBootstrap", () => ({
  useDeviceBootstrap: () => useDeviceBootstrapMock(),
}))

vi.mock("./layouts/MobileQRLayout", () => ({
  default: () => <div>Mobile QR Layout</div>,
}))

vi.mock("./layouts/TabletLayout", () => ({
  default: () => <div>Tablet Layout</div>,
}))

vi.mock("./layouts/LandscapeKioskLayout", () => ({
  default: () => <div>Landscape Kiosk Layout</div>,
}))

vi.mock("./layouts/PortraitKioskLayout", () => ({
  default: () => <div>Portrait Kiosk Layout</div>,
}))

describe("App", () => {
  beforeEach(() => {
    useDeviceBootstrapMock.mockReset()
  })

  it("renders MobileQRLayout when not a device", async () => {
    useDeviceBootstrapMock.mockReturnValue({
      isDevice: false,
      deviceContext: null,
      deviceLoading: false,
      deviceError: null,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText("Mobile QR Layout")).toBeInTheDocument()
    })
  })

  it("shows loading state when device is bootstrapping", async () => {
    useDeviceBootstrapMock.mockReturnValue({
      isDevice: true,
      deviceContext: null,
      deviceLoading: true,
      deviceError: null,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText("Starting up…")).toBeInTheDocument()
    })
  })

  it("shows error state when device bootstrap fails", async () => {
    useDeviceBootstrapMock.mockReturnValue({
      isDevice: true,
      deviceContext: null,
      deviceLoading: false,
      deviceError: "Failed to connect to device",
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText("Failed to connect to device")).toBeInTheDocument()
    })
  })

  it("shows default error when device context is missing", async () => {
    useDeviceBootstrapMock.mockReturnValue({
      isDevice: true,
      deviceContext: null,
      deviceLoading: false,
      deviceError: null,
    })

    render(<App />)

    await waitFor(() => {
      expect(
        screen.getByText("This device could not be started. Please contact staff.")
      ).toBeInTheDocument()
    })
  })

  it("renders Landscape Kiosk layout when specified in context", async () => {
    const deviceContext: OrderingContext = {
      session: "test-session",
      source: "Device",
      restaurant: "Test Restaurant",
      table: null,
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

    useDeviceBootstrapMock.mockReturnValue({
      isDevice: true,
      deviceContext,
      deviceLoading: false,
      deviceError: null,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText("Landscape Kiosk Layout")).toBeInTheDocument()
    })
  })

  it("renders Mobile layout when specified in context", async () => {
    const deviceContext: OrderingContext = {
      session: "test-session",
      source: "Device",
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

    useDeviceBootstrapMock.mockReturnValue({
      isDevice: true,
      deviceContext,
      deviceLoading: false,
      deviceError: null,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText("Mobile QR Layout")).toBeInTheDocument()
    })
  })

  it("renders Tablet layout when specified in context", async () => {
    const deviceContext: OrderingContext = {
      session: "test-session",
      source: "Device",
      restaurant: "Test Restaurant",
      table: "5",
      layout: "Tablet",
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

    useDeviceBootstrapMock.mockReturnValue({
      isDevice: true,
      deviceContext,
      deviceLoading: false,
      deviceError: null,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText("Tablet Layout")).toBeInTheDocument()
    })
  })

  it("renders Portrait Kiosk layout when specified in context", async () => {
    const deviceContext: OrderingContext = {
      session: "test-session",
      source: "Device",
      restaurant: "Test Restaurant",
      table: null,
      layout: "Portrait Kiosk",
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

    useDeviceBootstrapMock.mockReturnValue({
      isDevice: true,
      deviceContext,
      deviceLoading: false,
      deviceError: null,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText("Portrait Kiosk Layout")).toBeInTheDocument()
    })
  })

  it("passes initialContext to the layout component", async () => {
    const deviceContext: OrderingContext = {
      session: "test-session",
      source: "Device",
      restaurant: "Test Restaurant",
      table: "5",
      layout: "Landscape Kiosk",
      session_idle_timeout_minutes: 30,
      capabilities: {
        product_detail_enabled: true,
        show_item_images: true,
        show_item_descriptions: false,
        item_notes_enabled: false,
        request_bill_enabled: false,
        customer_payment_enabled: false,
        payment_link_enabled: false,
        pay_at_counter_enabled: false,
        add_to_running_table_enabled: false,
      },
    }

    useDeviceBootstrapMock.mockReturnValue({
      isDevice: true,
      deviceContext,
      deviceLoading: false,
      deviceError: null,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText("Landscape Kiosk Layout")).toBeInTheDocument()
    })
  })
})
