import { render, screen, fireEvent } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import CartPage from "./CartPage"
import type { CartEntry } from "../../hooks/useOrderingSession"

describe("CartPage", () => {
  const sampleItem1: CartEntry = {
    item: {
      item: "ITEM-1",
      item_name: "Margherita Pizza",
      rate: 350,
      special_dish: 0,
      disabled: 0,
      item_image: null,
      course: "Main",
      course_label: "Main Course",
    },
    qty: 2,
  }

  const sampleItem2: CartEntry = {
    item: {
      item: "ITEM-2",
      item_name: "Coke",
      rate: 50,
      special_dish: 0,
      disabled: 0,
      item_image: null,
      course: "Beverages",
      course_label: "Beverages",
    },
    qty: 1,
  }

  it("renders empty cart state", () => {
    const onBack = vi.fn()
    const onCheckout = vi.fn()
    const onIncrement = vi.fn()
    const onDecrement = vi.fn()

    render(
      <CartPage
        cartItems={[]}
        cartCount={0}
        cartTotal={0}
        onIncrement={onIncrement}
        onDecrement={onDecrement}
        onBack={onBack}
        onCheckout={onCheckout}
      />
    )

    expect(screen.getByText("Your cart is empty.")).toBeInTheDocument()
    expect(screen.getByText("Browse the menu")).toBeInTheDocument()
  })

  it("renders cart items with quantities", () => {
    render(
      <CartPage
        cartItems={[sampleItem1, sampleItem2]}
        cartCount={3}
        cartTotal={750}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
        onBack={vi.fn()}
        onCheckout={vi.fn()}
      />
    )

    expect(screen.getByText("Margherita Pizza")).toBeInTheDocument()
    expect(screen.getByText("Coke")).toBeInTheDocument()
    expect(screen.getAllByText("2")).toHaveLength(1)
    expect(screen.getByText("1")).toBeInTheDocument()
  })

  it("calls onIncrement when + button is clicked", () => {
    const onIncrement = vi.fn()

    render(
      <CartPage
        cartItems={[sampleItem1]}
        cartCount={1}
        cartTotal={350}
        onIncrement={onIncrement}
        onDecrement={vi.fn()}
        onBack={vi.fn()}
        onCheckout={vi.fn()}
      />
    )

    const plusButtons = screen.getAllByRole("button", { name: /Add one more/ })
    fireEvent.click(plusButtons[0])
    expect(onIncrement).toHaveBeenCalledOnce()
  })

  it("calls onDecrement when - button is clicked", () => {
    const onDecrement = vi.fn()

    render(
      <CartPage
        cartItems={[sampleItem1]}
        cartCount={1}
        cartTotal={350}
        onIncrement={vi.fn()}
        onDecrement={onDecrement}
        onBack={vi.fn()}
        onCheckout={vi.fn()}
      />
    )

    const minusButtons = screen.getAllByRole("button", { name: /Remove one/ })
    fireEvent.click(minusButtons[0])
    expect(onDecrement).toHaveBeenCalledWith(sampleItem1.item.item)
  })

  it("displays correct cart summary", () => {
    render(
      <CartPage
        cartItems={[sampleItem1, sampleItem2]}
        cartCount={3}
        cartTotal={750}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
        onBack={vi.fn()}
        onCheckout={vi.fn()}
      />
    )

    expect(screen.getByText("3 items")).toBeInTheDocument()
    expect(screen.getByText("750")).toBeInTheDocument()
  })

  it("displays singular item when cartCount is 1", () => {
    render(
      <CartPage
        cartItems={[sampleItem1]}
        cartCount={1}
        cartTotal={350}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
        onBack={vi.fn()}
        onCheckout={vi.fn()}
      />
    )

    expect(screen.getByText("1 item")).toBeInTheDocument()
  })

  it("calls onCheckout when checkout button is clicked", () => {
    const onCheckout = vi.fn()

    render(
      <CartPage
        cartItems={[sampleItem1]}
        cartCount={1}
        cartTotal={350}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
        onBack={vi.fn()}
        onCheckout={onCheckout}
      />
    )

    fireEvent.click(screen.getByText("Proceed to checkout"))
    expect(onCheckout).toHaveBeenCalledOnce()
  })

  it("disables checkout button when cart is empty", () => {
    const onCheckout = vi.fn()

    render(
      <CartPage
        cartItems={[]}
        cartCount={0}
        cartTotal={0}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
        onBack={vi.fn()}
        onCheckout={onCheckout}
      />
    )

    const checkoutBtn = screen.getByRole("button", {
      name: "Proceed to checkout",
    })
    expect(checkoutBtn).toBeDisabled()

    fireEvent.click(checkoutBtn)
    expect(onCheckout).not.toHaveBeenCalled()
  })

  it("calls onBack when back button is clicked", () => {
    const onBack = vi.fn()

    render(
      <CartPage
        cartItems={[sampleItem1]}
        cartCount={1}
        cartTotal={350}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
        onBack={onBack}
        onCheckout={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText("← Back to menu"))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it("shows item notes when itemNotesEnabled and notes exist", () => {
    const itemWithNote: CartEntry = {
      ...sampleItem1,
      comment: "No onions please",
    }

    render(
      <CartPage
        cartItems={[itemWithNote]}
        cartCount={1}
        cartTotal={350}
        itemNotesEnabled={true}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
        onBack={vi.fn()}
        onCheckout={vi.fn()}
      />
    )

    expect(screen.getByText("Note: No onions please")).toBeInTheDocument()
  })

  it("hides item notes when itemNotesEnabled is false", () => {
    const itemWithNote: CartEntry = {
      ...sampleItem1,
      comment: "No onions please",
    }

    render(
      <CartPage
        cartItems={[itemWithNote]}
        cartCount={1}
        cartTotal={350}
        itemNotesEnabled={false}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
        onBack={vi.fn()}
        onCheckout={vi.fn()}
      />
    )

    expect(screen.queryByText("Note: No onions please")).not.toBeInTheDocument()
  })

  it("applies custom className when provided", () => {
    const { container } = render(
      <CartPage
        cartItems={[sampleItem1]}
        cartCount={1}
        cartTotal={350}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
        onBack={vi.fn()}
        onCheckout={vi.fn()}
        className="custom-class"
      />
    )

    expect(container.firstChild).toHaveClass("custom-class")
  })
})
