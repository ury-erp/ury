import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const getCustomerProductMock = vi.fn()

vi.mock("../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api")>("../../lib/api")
  return {
    ...actual,
    getCustomerProduct: (...args: any[]) => getCustomerProductMock(...args),
  }
})

import ProductDetail from "./ProductDetail"
import type { MenuItem } from "../../lib/api"

const baseItem: MenuItem = {
  item: "TEST-001",
  item_name: "Test Pizza",
  rate: 300,
  special_dish: 0,
  disabled: 0,
  item_image: null,
  course: null,
  course_label: null,
}

describe("ProductDetail", () => {
  beforeEach(() => {
    getCustomerProductMock.mockReset()
  })

  it("shows loading state while fetching product details", () => {
    getCustomerProductMock.mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    render(
      <ProductDetail
        session="test-session"
        itemCode="TEST-001"
        menuItem={baseItem}
        onAddToCart={vi.fn()}
        onBack={vi.fn()}
      />
    )

    expect(screen.getByText("Loading item...")).toBeInTheDocument()
  })

  it("calls onBack from loading state", async () => {
    const onBack = vi.fn()
    getCustomerProductMock.mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    render(
      <ProductDetail
        session="test-session"
        itemCode="TEST-001"
        menuItem={baseItem}
        onAddToCart={vi.fn()}
        onBack={onBack}
      />
    )

    const backButton = screen.getByText("Back")
    await userEvent.click(backButton)

    expect(onBack).toHaveBeenCalled()
  })

  it("renders product details when loaded", async () => {
    getCustomerProductMock.mockResolvedValueOnce({
      item_code: "TEST-001",
      item_name: "Test Pizza",
      description: "Delicious pizza",
      image: "/image.jpg",
      variants: [],
      addons: [],
    })

    render(
      <ProductDetail
        session="test-session"
        itemCode="TEST-001"
        menuItem={baseItem}
        onAddToCart={vi.fn()}
        onBack={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText("Test Pizza")).toBeInTheDocument()
      expect(screen.getByText("Delicious pizza")).toBeInTheDocument()
    })
  })

  it("displays the product price from menu item", async () => {
    getCustomerProductMock.mockResolvedValueOnce({
      item_code: "TEST-001",
      item_name: "Test Pizza",
      description: "Delicious pizza",
      image: null,
      variants: [],
      addons: [],
    })

    render(
      <ProductDetail
        session="test-session"
        itemCode="TEST-001"
        menuItem={baseItem}
        onAddToCart={vi.fn()}
        onBack={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText("300")).toBeInTheDocument()
    })
  })

  it("shows error message when product fails to load", async () => {
    getCustomerProductMock.mockRejectedValueOnce(new Error("Network error"))

    render(
      <ProductDetail
        session="test-session"
        itemCode="TEST-001"
        menuItem={baseItem}
        onAddToCart={vi.fn()}
        onBack={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument()
    })
  })

  it("renders variants when available", async () => {
    getCustomerProductMock.mockResolvedValueOnce({
      item_code: "TEST-001",
      item_name: "Test Pizza",
      description: "Delicious pizza",
      image: null,
      variants: [
        { item_code: "VAR-1", item_name: "Small", rate: 250 },
        { item_code: "VAR-2", item_name: "Large", rate: 400 },
      ],
      addons: [],
    })

    render(
      <ProductDetail
        session="test-session"
        itemCode="TEST-001"
        menuItem={baseItem}
        onAddToCart={vi.fn()}
        onBack={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText("Variants")).toBeInTheDocument()
      expect(screen.getByText("Small")).toBeInTheDocument()
      expect(screen.getByText("Large")).toBeInTheDocument()
    })
  })

  it("renders addons when available", async () => {
    getCustomerProductMock.mockResolvedValueOnce({
      item_code: "TEST-001",
      item_name: "Test Pizza",
      description: "Delicious pizza",
      image: null,
      variants: [],
      addons: [
        { item_code: "ADD-1", item_name: "Extra Cheese", rate: 50 },
        { item_code: "ADD-2", item_name: "Pepperoni", rate: 75 },
      ],
    })

    render(
      <ProductDetail
        session="test-session"
        itemCode="TEST-001"
        menuItem={baseItem}
        onAddToCart={vi.fn()}
        onBack={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText("Add-ons")).toBeInTheDocument()
      expect(screen.getByText("Extra Cheese")).toBeInTheDocument()
      expect(screen.getByText("Pepperoni")).toBeInTheDocument()
    })
  })

  it("allows selecting a variant", async () => {
    getCustomerProductMock.mockResolvedValueOnce({
      item_code: "TEST-001",
      item_name: "Test Pizza",
      description: "Delicious pizza",
      image: null,
      variants: [
        { item_code: "VAR-1", item_name: "Small", rate: 250 },
        { item_code: "VAR-2", item_name: "Large", rate: 400 },
      ],
      addons: [],
    })

    render(
      <ProductDetail
        session="test-session"
        itemCode="TEST-001"
        menuItem={baseItem}
        onAddToCart={vi.fn()}
        onBack={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText("Small")).toBeInTheDocument()
    })

    const smallButton = screen.getByText("Small")
    await userEvent.click(smallButton)

    // After clicking, the component state changes to select this variant
    // The style updates to show border-primary
    await waitFor(() => {
      expect(smallButton.closest("button")).toHaveClass("border-primary")
    })
  })

  it("allows toggling addons", async () => {
    getCustomerProductMock.mockResolvedValueOnce({
      item_code: "TEST-001",
      item_name: "Test Pizza",
      description: "Delicious pizza",
      image: null,
      variants: [],
      addons: [
        { item_code: "ADD-1", item_name: "Extra Cheese", rate: 50 },
      ],
    })

    render(
      <ProductDetail
        session="test-session"
        itemCode="TEST-001"
        menuItem={baseItem}
        onAddToCart={vi.fn()}
        onBack={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText("Extra Cheese")).toBeInTheDocument()
    })

    const cheeseButton = screen.getByText("Extra Cheese")
    await userEvent.click(cheeseButton)

    // After clicking, addon is selected
    await waitFor(() => {
      expect(cheeseButton.closest("button")).toHaveClass("border-primary")
    })
  })

  it("increments and decrements quantity", async () => {
    getCustomerProductMock.mockResolvedValueOnce({
      item_code: "TEST-001",
      item_name: "Test Pizza",
      description: "Delicious pizza",
      image: null,
      variants: [],
      addons: [],
    })

    render(
      <ProductDetail
        session="test-session"
        itemCode="TEST-001"
        menuItem={baseItem}
        onAddToCart={vi.fn()}
        onBack={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText("1")).toBeInTheDocument()
    })

    const increaseButton = screen.getByLabelText("Increase quantity")
    await userEvent.click(increaseButton)

    expect(screen.getByText("2")).toBeInTheDocument()

    const decreaseButton = screen.getByLabelText("Decrease quantity")
    await userEvent.click(decreaseButton)

    expect(screen.getByText("1")).toBeInTheDocument()
  })

  it("calls onAddToCart with correct parameters", async () => {
    const onAddToCart = vi.fn()
    getCustomerProductMock.mockResolvedValueOnce({
      item_code: "TEST-001",
      item_name: "Test Pizza",
      description: "Delicious pizza",
      image: null,
      variants: [],
      addons: [],
    })

    render(
      <ProductDetail
        session="test-session"
        itemCode="TEST-001"
        menuItem={baseItem}
        onAddToCart={onAddToCart}
        onBack={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText("Add to cart")).toBeInTheDocument()
    })

    const addButton = screen.getByText("Add to cart")
    await userEvent.click(addButton)

    expect(onAddToCart).toHaveBeenCalledWith(baseItem, {})
  })

  it("calls onBack after adding to cart", async () => {
    const onBack = vi.fn()
    const onAddToCart = vi.fn()
    getCustomerProductMock.mockResolvedValueOnce({
      item_code: "TEST-001",
      item_name: "Test Pizza",
      description: "Delicious pizza",
      image: null,
      variants: [],
      addons: [],
    })

    render(
      <ProductDetail
        session="test-session"
        itemCode="TEST-001"
        menuItem={baseItem}
        onAddToCart={onAddToCart}
        onBack={onBack}
      />
    )

    await waitFor(() => {
      expect(screen.getByText("Add to cart")).toBeInTheDocument()
    })

    const addButton = screen.getByText("Add to cart")
    await userEvent.click(addButton)

    expect(onBack).toHaveBeenCalled()
  })
})
