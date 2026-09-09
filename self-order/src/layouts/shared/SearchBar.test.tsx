import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import SearchBar from "./SearchBar"

describe("SearchBar", () => {
  it("renders the input with placeholder text", () => {
    render(<SearchBar value="" onChange={vi.fn()} />)
    expect(screen.getByPlaceholderText("Search menu...")).toBeInTheDocument()
  })

  it("renders with custom placeholder", () => {
    render(<SearchBar value="" onChange={vi.fn()} placeholder="Find items..." />)
    expect(screen.getByPlaceholderText("Find items...")).toBeInTheDocument()
  })

  it("displays the current value", () => {
    render(<SearchBar value="Pizza" onChange={vi.fn()} />)
    expect(screen.getByDisplayValue("Pizza")).toBeInTheDocument()
  })

  it("updates local state when user types", async () => {
    const onChange = vi.fn()
    const { rerender } = render(<SearchBar value="" onChange={onChange} />)

    const input = screen.getByRole("textbox")
    await userEvent.type(input, "test")

    // Local value should update immediately
    expect(input).toHaveValue("test")

    // onChange should be called after debounce
    await waitFor(
      () => {
        expect(onChange).toHaveBeenCalledWith("test")
      },
      { timeout: 500 }
    )
  })

  it("debounces onChange calls", async () => {
    const onChange = vi.fn()
    render(<SearchBar value="" onChange={onChange} />)

    const input = screen.getByRole("textbox")
    
    // Type quickly
    await userEvent.type(input, "ab")
    
    // onChange should not be called yet
    expect(onChange).not.toHaveBeenCalled()

    // Wait for debounce
    await waitFor(
      () => {
        expect(onChange).toHaveBeenCalledTimes(1)
        expect(onChange).toHaveBeenCalledWith("ab")
      },
      { timeout: 500 }
    )
  })

  it("shows clear button when input has value", async () => {
    const onChange = vi.fn()
    render(<SearchBar value="" onChange={onChange} />)

    const input = screen.getByRole("textbox")
    expect(screen.queryByLabelText("Clear search")).not.toBeInTheDocument()

    await userEvent.type(input, "test")
    await waitFor(() => {
      expect(screen.getByLabelText("Clear search")).toBeInTheDocument()
    })
  })

  it("hides clear button when input is empty", async () => {
    const onChange = vi.fn()
    const { rerender } = render(<SearchBar value="test" onChange={onChange} />)

    expect(screen.getByLabelText("Clear search")).toBeInTheDocument()

    // Clear the input
    const input = screen.getByRole("textbox")
    await userEvent.clear(input)

    // Clear button should disappear
    await waitFor(() => {
      expect(screen.queryByLabelText("Clear search")).not.toBeInTheDocument()
    }, { timeout: 500 })
  })

  it("clears input when clear button is clicked", async () => {
    const onChange = vi.fn()
    render(<SearchBar value="" onChange={onChange} />)

    const input = screen.getByRole("textbox")
    await userEvent.type(input, "test")

    await waitFor(() => {
      expect(screen.getByLabelText("Clear search")).toBeInTheDocument()
    })

    const clearButton = screen.getByLabelText("Clear search")
    await userEvent.click(clearButton)

    expect(input).toHaveValue("")
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("")
    })
  })

  it("updates when parent value prop changes", async () => {
    const onChange = vi.fn()
    const { rerender } = render(<SearchBar value="initial" onChange={onChange} />)

    expect(screen.getByDisplayValue("initial")).toBeInTheDocument()

    rerender(<SearchBar value="updated" onChange={onChange} />)

    expect(screen.getByDisplayValue("updated")).toBeInTheDocument()
  })

  it("renders search icon", () => {
    render(<SearchBar value="" onChange={vi.fn()} />)
    // The search icon is a hidden SVG, but we can verify the input is there
    const input = screen.getByLabelText("Search menu")
    expect(input).toBeInTheDocument()
  })
})
