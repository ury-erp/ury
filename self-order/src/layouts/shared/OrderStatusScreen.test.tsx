import { render, screen, fireEvent } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import OrderStatusScreen from "./OrderStatusScreen"
import type { OrderStatus } from "../../lib/api"

describe("OrderStatusScreen", () => {
  const baseStatus: OrderStatus = {
    session_status: "open",
    invoice: "INV-001",
    submitted: true,
    billed: false,
    open_requests: [],
  }

  it("renders the confirmation header", () => {
    render(
      <OrderStatusScreen
        status={baseStatus}
        isPickup={false}
        canAddMore={false}
      />
    )

    expect(screen.getByText("Order confirmed")).toBeInTheDocument()
    expect(
      screen.getByText("Thanks — your order has been sent to the restaurant.")
    ).toBeInTheDocument()
  })

  it("displays the pickup code for pickup orders", () => {
    render(
      <OrderStatusScreen
        status={baseStatus}
        isPickup={true}
        pickupCode="ABC123"
        canAddMore={false}
      />
    )

    expect(screen.getByText("ABC123")).toBeInTheDocument()
    expect(screen.getByText("Pickup code")).toBeInTheDocument()
  })

  it("does not display pickup code for dine-in orders", () => {
    render(
      <OrderStatusScreen
        status={baseStatus}
        isPickup={false}
        pickupCode="ABC123"
        canAddMore={false}
      />
    )

    expect(screen.queryByText("ABC123")).not.toBeInTheDocument()
  })

  it("shows order status when provided", () => {
    render(
      <OrderStatusScreen
        status={baseStatus}
        isPickup={false}
        canAddMore={false}
      />
    )

    expect(screen.getByText("Order status")).toBeInTheDocument()
    expect(screen.getByText("Submitted")).toBeInTheDocument()
  })

  it("shows bill status when provided", () => {
    render(
      <OrderStatusScreen
        status={baseStatus}
        isPickup={false}
        canAddMore={false}
      />
    )

    expect(screen.getByText("Bill status")).toBeInTheDocument()
    expect(screen.getByText("Not billed yet")).toBeInTheDocument()
  })

  it("shows open service requests", () => {
    const statusWithRequests: OrderStatus = {
      ...baseStatus,
      open_requests: [
        { name: "REQ-001", request_type: "Water", status: "Open" },
        { name: "REQ-002", request_type: "Napkins", status: "Acknowledged" },
      ],
    }

    render(
      <OrderStatusScreen
        status={statusWithRequests}
        isPickup={false}
        canAddMore={false}
      />
    )

    expect(screen.getByText("Open service requests")).toBeInTheDocument()
    expect(screen.getByText("Water")).toBeInTheDocument()
    expect(screen.getByText("Napkins")).toBeInTheDocument()
    expect(screen.getByText("Open")).toBeInTheDocument()
    expect(screen.getByText("Acknowledged")).toBeInTheDocument()
  })

  it("renders \"Add more items\" button when canAddMore is true", () => {
    const onAddMore = vi.fn()

    render(
      <OrderStatusScreen
        status={baseStatus}
        isPickup={false}
        canAddMore={true}
        onAddMore={onAddMore}
      />
    )

    const addMoreBtn = screen.getByText("Add more items")
    expect(addMoreBtn).toBeInTheDocument()

    fireEvent.click(addMoreBtn)
    expect(onAddMore).toHaveBeenCalledOnce()
  })

  it("does not render \"Add more items\" button when canAddMore is false", () => {
    render(
      <OrderStatusScreen
        status={baseStatus}
        isPickup={false}
        canAddMore={false}
      />
    )

    expect(screen.queryByText("Add more items")).not.toBeInTheDocument()
  })

  it("renders \"Done\" button when onDone is provided", () => {
    const onDone = vi.fn()

    render(
      <OrderStatusScreen
        status={baseStatus}
        isPickup={false}
        canAddMore={false}
        onDone={onDone}
      />
    )

    const doneBtn = screen.getByText("Done")
    expect(doneBtn).toBeInTheDocument()

    fireEvent.click(doneBtn)
    expect(onDone).toHaveBeenCalledOnce()
  })

  it("does not render \"Done\" button when onDone is not provided", () => {
    render(
      <OrderStatusScreen
        status={baseStatus}
        isPickup={false}
        canAddMore={false}
      />
    )

    expect(screen.queryByText("Done")).not.toBeInTheDocument()
  })

  it("handles null status gracefully", () => {
    render(
      <OrderStatusScreen
        status={null}
        isPickup={false}
        canAddMore={false}
      />
    )

    expect(screen.getByText("Order confirmed")).toBeInTheDocument()
  })

  it("shows \"Pending\" when order is not submitted", () => {
    const pendingStatus: OrderStatus = {
      session_status: "open",
      invoice: null,
      submitted: false,
      billed: false,
    }

    render(
      <OrderStatusScreen
        status={pendingStatus}
        isPickup={false}
        canAddMore={false}
      />
    )

    expect(screen.getByText("Pending")).toBeInTheDocument()
  })

  it("shows \"Billed\" when billed is true", () => {
    const billedStatus: OrderStatus = {
      session_status: "closed",
      invoice: "INV-001",
      submitted: true,
      billed: true,
    }

    render(
      <OrderStatusScreen
        status={billedStatus}
        isPickup={false}
        canAddMore={false}
      />
    )

    expect(screen.getByText("Billed")).toBeInTheDocument()
  })
})
