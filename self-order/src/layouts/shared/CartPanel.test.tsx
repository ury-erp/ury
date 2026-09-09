import { render, screen, fireEvent } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import CartPanel from "./CartPanel"
import type { OrderingContext, CustomerOrder, MenuItem } from "../../lib/api"

describe("CartPanel", () => {
  const baseContext: OrderingContext = {
    session: "test-session",
    source: "QR",
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

  const sampleItem1: MenuItem = {
    item: "ITEM-1",
    item_name: "Margherita Pizza",
    rate: 350,
    special_dish: 0,
    disabled: 0,
    item_image: null,
    course: "Main",
    course_label: "Main Course",
  }

  const cartEntry1 = { item: sampleItem1, qty: 2 }

  const sampleOrder: CustomerOrder = {
    invoice: "INV-001",
    table: "5",
    items: [
      {
        item_code: "ITEM-1",
        item_name: "Margherita Pizza",
        qty: 1,
        comment: null,
        rate: 350,
        amount: 350,
      },
    ],
    grand_total: 350,
    billed: false,
    pickup_code: null,
  }

  it("renders empty cart state", () => {
    render(
      <CartPanel
        context={baseContext}
        order={null}
        cartItems={[]}
        cartCount={0}
        cartTotal={0}
        submitting={false}
        billRequested={false}
        payingOnline={false}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
        onSubmit={vi.fn()}
        onRequestBill={vi.fn()}
        onPayOnline={vi.fn()}
      />
    )

    expect(
      screen.getByText("Tap a menu item to add it to your cart.")
    ).toBeInTheDocument()
  })

  it("renders cart items with increment/decrement controls", () => {
    render(
      <CartPanel
        context={baseContext}
        order={null}
        cartItems={[cartEntry1]}
        cartCount={2}
        cartTotal={700}
        submitting={false}
        billRequested={false}
        payingOnline={false}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
        onSubmit={vi.fn()}
        onRequestBill={vi.fn()}
        onPayOnline={vi.fn()}
      />
    )

    expect(screen.getByText("Margherita Pizza")).toBeInTheDocument()
    expect(screen.getByText("2")).toBeInTheDocument()
  })

  it("calls onIncrement when + button is clicked", () => {
    const onIncrement = vi.fn()

    render(
      <CartPanel
        context={baseContext}
        order={null}
        cartItems={[cartEntry1]}
        cartCount={2}
        cartTotal={700}
        submitting={false}
        billRequested={false}
        payingOnline={false}
        onIncrement={onIncrement}
        onDecrement={vi.fn()}
        onSubmit={vi.fn()}
        onRequestBill={vi.fn()}
        onPayOnline={vi.fn()}
      />
    )

    const plusButtons = screen.getAllByRole("button", { name: /Add one more/ })
    fireEvent.click(plusButtons[0])
    expect(onIncrement).toHaveBeenCalledOnce()
  })

  it("calls onDecrement when - button is clicked", () => {
    const onDecrement = vi.fn()

    render(
      <CartPanel
        context={baseContext}
        order={null}
        cartItems={[cartEntry1]}
        cartCount={2}
        cartTotal={700}
        submitting={false}
        billRequested={false}
        payingOnline={false}
        onIncrement={vi.fn()}
        onDecrement={onDecrement}
        onSubmit={vi.fn()}
        onRequestBill={vi.fn()}
        onPayOnline={vi.fn()}
      />
    )

    const minusButtons = screen.getAllByRole("button", { name: /Remove one/ })
    fireEvent.click(minusButtons[0])
    expect(onDecrement).toHaveBeenCalledWith("ITEM-1")
  })

  it("displays correct cart summary", () => {
    render(
      <CartPanel
        context={baseContext}
        order={null}
        cartItems={[cartEntry1]}
        cartCount={2}
        cartTotal={700}
        submitting={false}
        billRequested={false}
        payingOnline={false}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
        onSubmit={vi.fn()}
        onRequestBill={vi.fn()}
        onPayOnline={vi.fn()}
      />
    )

    expect(screen.getByText("2 items")).toBeInTheDocument()
  })

  it("calls onSubmit when Place Order button is clicked", () => {
    const onSubmit = vi.fn()

    render(
      <CartPanel
        context={baseContext}
        order={null}
        cartItems={[cartEntry1]}
        cartCount={2}
        cartTotal={700}
        submitting={false}
        billRequested={false}
        payingOnline={false}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
        onSubmit={onSubmit}
        onRequestBill={vi.fn()}
        onPayOnline={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText("Place Order"))
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it("shows previous order summary when order is present", () => {
    render(
      <CartPanel
        context={baseContext}
        order={sampleOrder}
        cartItems={[]}
        cartCount={0}
        cartTotal={0}
        submitting={false}
        billRequested={false}
        payingOnline={false}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
        onSubmit={vi.fn()}
        onRequestBill={vi.fn()}
        onPayOnline={vi.fn()}
      />
    )

    expect(screen.getByText("Your order so far")).toBeInTheDocument()
    expect(screen.getByText("Margherita Pizza × 1")).toBeInTheDocument()
  })

  it("disables Place Order button when submitting", () => {
    const onSubmit = vi.fn()

    render(
      <CartPanel
        context={baseContext}
        order={null}
        cartItems={[cartEntry1]}
        cartCount={2}
        cartTotal={700}
        submitting={true}
        billRequested={false}
        payingOnline={false}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
        onSubmit={onSubmit}
        onRequestBill={vi.fn()}
        onPayOnline={vi.fn()}
      />
    )

    const placeBtn = screen.getByText("Placing order…")
    expect(placeBtn).toBeDisabled()

    fireEvent.click(placeBtn)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("disables Place Order button when cart is empty", () => {
    render(
      <CartPanel
        context={baseContext}
        order={null}
        cartItems={[]}
        cartCount={0}
        cartTotal={0}
        submitting={false}
        billRequested={false}
        payingOnline={false}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
        onSubmit={vi.fn()}
        onRequestBill={vi.fn()}
        onPayOnline={vi.fn()}
      />
    )

    const placeBtn = screen.getByText("Place Order")
    expect(placeBtn).toBeDisabled()
  })

  it("shows Pay Online button when customer_payment_enabled", () => {
    const contextWithPayment: OrderingContext = {
      ...baseContext,
      capabilities: { ...baseContext.capabilities, customer_payment_enabled: true },
    }

    const onPayOnline = vi.fn()

    render(
      <CartPanel
        context={contextWithPayment}
        order={sampleOrder}
        cartItems={[]}
        cartCount={0}
        cartTotal={0}
        submitting={false}
        billRequested={false}
        payingOnline={false}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
        onSubmit={vi.fn()}
        onRequestBill={vi.fn()}
        onPayOnline={onPayOnline}
      />
    )

    const payOnlineBtn = screen.getByText("Pay Online")
    expect(payOnlineBtn).toBeInTheDocument()

    fireEvent.click(payOnlineBtn)
    expect(onPayOnline).toHaveBeenCalledOnce()
  })

  it("shows Request Bill button when request_bill_enabled", () => {
    const contextWithBill: OrderingContext = {
      ...baseContext,
      capabilities: { ...baseContext.capabilities, request_bill_enabled: true },
    }

    const onRequestBill = vi.fn()

    render(
      <CartPanel
        context={contextWithBill}
        order={sampleOrder}
        cartItems={[]}
        cartCount={0}
        cartTotal={0}
        submitting={false}
        billRequested={false}
        payingOnline={false}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
        onSubmit={vi.fn()}
        onRequestBill={onRequestBill}
        onPayOnline={vi.fn()}
      />
    )

    const billBtn = screen.getByText("Request Bill")
    expect(billBtn).toBeInTheDocument()

    fireEvent.click(billBtn)
    expect(onRequestBill).toHaveBeenCalledOnce()
  })

  it("disables Pay Online button when payingOnline", () => {
    const contextWithPayment: OrderingContext = {
      ...baseContext,
      capabilities: { ...baseContext.capabilities, customer_payment_enabled: true },
    }

    render(
      <CartPanel
        context={contextWithPayment}
        order={sampleOrder}
        cartItems={[]}
        cartCount={0}
        cartTotal={0}
        submitting={false}
        billRequested={false}
        payingOnline={true}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
        onSubmit={vi.fn()}
        onRequestBill={vi.fn()}
        onPayOnline={vi.fn()}
      />
    )

    const payOnlineBtn = screen.getByText("Starting payment…")
    expect(payOnlineBtn).toBeDisabled()
  })

  it("disables Request Bill button when billRequested", () => {
    const contextWithBill: OrderingContext = {
      ...baseContext,
      capabilities: { ...baseContext.capabilities, request_bill_enabled: true },
    }

    render(
      <CartPanel
        context={contextWithBill}
        order={sampleOrder}
        cartItems={[]}
        cartCount={0}
        cartTotal={0}
        submitting={false}
        billRequested={true}
        payingOnline={false}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
        onSubmit={vi.fn()}
        onRequestBill={vi.fn()}
        onPayOnline={vi.fn()}
      />
    )

    const billBtn = screen.getByText("Bill requested — staff notified")
    expect(billBtn).toBeDisabled()
  })

  it("hides payment buttons when order is billed", () => {
    const contextWithPayment: OrderingContext = {
      ...baseContext,
      capabilities: { ...baseContext.capabilities, customer_payment_enabled: true },
    }

    const billedOrder: CustomerOrder = { ...sampleOrder, billed: true }

    render(
      <CartPanel
        context={contextWithPayment}
        order={billedOrder}
        cartItems={[]}
        cartCount={0}
        cartTotal={0}
        submitting={false}
        billRequested={false}
        payingOnline={false}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
        onSubmit={vi.fn()}
        onRequestBill={vi.fn()}
        onPayOnline={vi.fn()}
      />
    )

    expect(screen.queryByText("Pay Online")).not.toBeInTheDocument()
  })
})
