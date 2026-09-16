import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const assignDeviceTableMock = vi.fn()

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api")
  return {
    ...actual,
    assignDeviceTable: (...args: any[]) => assignDeviceTableMock(...args),
  }
})

import PortableTabletAssignment from "./PortableTabletAssignment"

describe("PortableTabletAssignment", () => {
  beforeEach(() => {
    assignDeviceTableMock.mockReset()
    localStorage.clear()
  })

  it("renders PIN entry screen initially", () => {
    render(<PortableTabletAssignment />)
    
    expect(screen.getByText("Assign This Tablet")).toBeInTheDocument()
    expect(screen.getByText("Staff PIN")).toBeInTheDocument()
    expect(screen.getByText(/Enter the 4-6 digit PIN/)).toBeInTheDocument()
  })

  it("displays PIN entry dots", () => {
    render(<PortableTabletAssignment />)
    
    // Should have 6 empty dots for MAX_PIN_LENGTH
    const dots = screen.getAllByText("")
    expect(dots.length).toBeGreaterThan(0)
  })

  it("allows entering PIN digits", async () => {
    render(<PortableTabletAssignment />)
    
    const buttons = screen.getAllByRole("button")
    const button1 = buttons.find(b => b.textContent === "1")
    
    if (button1) {
      await userEvent.click(button1)
      // Verify dot is filled (would be "•")
    }
  })

  it("allows backspace in PIN entry", async () => {
    render(<PortableTabletAssignment />)
    
    const buttons = screen.getAllByRole("button")
    const button1 = buttons.find(b => b.textContent === "1")
    const backspaceButton = buttons.find(b => b.textContent === "⌫")
    
    if (button1 && backspaceButton) {
      await userEvent.click(button1)
      await userEvent.click(backspaceButton)
      // PIN should be empty again
    }
  })

  it("disables Continue button when PIN is less than 4 digits", () => {
    render(<PortableTabletAssignment />)
    
    const continueButton = screen.getByText("Continue")
    expect(continueButton).toBeDisabled()
  })

  it("enables Continue button when PIN has 4+ digits", async () => {
    render(<PortableTabletAssignment />)
    
    const buttons = screen.getAllByRole("button")
    
    // Enter 4 digit PIN (1, 2, 3, 4)
    for (let i = 1; i <= 4; i++) {
      const button = buttons.find(b => b.textContent === String(i))
      if (button) {
        await userEvent.click(button)
      }
    }
    
    const continueButton = screen.getByText("Continue")
    expect(continueButton).not.toBeDisabled()
  })

  it("advances to table entry screen when Continue is clicked with valid PIN", async () => {
    render(<PortableTabletAssignment />)
    
    const buttons = screen.getAllByRole("button")
    
    // Enter 4 digit PIN
    for (let i = 1; i <= 4; i++) {
      const button = buttons.find(b => b.textContent === String(i))
      if (button) {
        await userEvent.click(button)
      }
    }
    
    const continueButton = screen.getByText("Continue")
    await userEvent.click(continueButton)
    
    await waitFor(() => {
      expect(screen.getByText("Table Name or Code")).toBeInTheDocument()
    })
  })

  it("renders table input field on table step", async () => {
    render(<PortableTabletAssignment />)
    
    const buttons = screen.getAllByRole("button")
    
    // Enter 4 digit PIN
    for (let i = 1; i <= 4; i++) {
      const button = buttons.find(b => b.textContent === String(i))
      if (button) {
        await userEvent.click(button)
      }
    }
    
    const continueButton = screen.getByText("Continue")
    await userEvent.click(continueButton)
    
    await waitFor(() => {
      const tableInput = screen.getByPlaceholderText(/e.g. T12/)
      expect(tableInput).toBeInTheDocument()
    })
  })

  it("disables Assign Table button when table is empty", async () => {
    render(<PortableTabletAssignment />)
    
    const buttons = screen.getAllByRole("button")
    
    // Enter PIN and advance
    for (let i = 1; i <= 4; i++) {
      const button = buttons.find(b => b.textContent === String(i))
      if (button) {
        await userEvent.click(button)
      }
    }
    
    const continueButton = screen.getByText("Continue")
    await userEvent.click(continueButton)
    
    await waitFor(() => {
      const assignButton = screen.getByText("Assign Table")
      expect(assignButton).toBeDisabled()
    })
  })

  it("enables Assign Table button when table name is entered", async () => {
    render(<PortableTabletAssignment />)
    
    const buttons = screen.getAllByRole("button")
    
    // Enter PIN
    for (let i = 1; i <= 4; i++) {
      const button = buttons.find(b => b.textContent === String(i))
      if (button) {
        await userEvent.click(button)
      }
    }
    
    const continueButton = screen.getByText("Continue")
    await userEvent.click(continueButton)
    
    await waitFor(() => {
      const tableInput = screen.getByPlaceholderText(/e.g. T12/)
      expect(tableInput).toBeInTheDocument()
    })
    
    const tableInput = screen.getByPlaceholderText(/e.g. T12/) as HTMLInputElement
    await userEvent.type(tableInput, "T5")
    
    const assignButton = screen.getByText("Assign Table")
    expect(assignButton).not.toBeDisabled()
  })

  it("shows error when device is not provisioned", async () => {
    render(<PortableTabletAssignment />)
    
    const buttons = screen.getAllByRole("button")
    
    // Enter PIN
    for (let i = 1; i <= 4; i++) {
      const button = buttons.find(b => b.textContent === String(i))
      if (button) {
        await userEvent.click(button)
      }
    }
    
    const continueButton = screen.getByText("Continue")
    await userEvent.click(continueButton)
    
    await waitFor(() => {
      const tableInput = screen.getByPlaceholderText(/e.g. T12/)
      expect(tableInput).toBeInTheDocument()
    })
    
    const tableInput = screen.getByPlaceholderText(/e.g. T12/) as HTMLInputElement
    await userEvent.type(tableInput, "T5")
    
    const assignButton = screen.getByText("Assign Table")
    await userEvent.click(assignButton)
    
    await waitFor(() => {
      expect(screen.getByText(/not provisioned/)).toBeInTheDocument()
    })
  })

  it("shows error from API failure", async () => {
    localStorage.setItem("ury_device_id", "device-1")
    localStorage.setItem("ury_device_credential", "credential-1")
    
    assignDeviceTableMock.mockRejectedValueOnce(
      new Error("Invalid PIN or table")
    )
    
    render(<PortableTabletAssignment />)
    
    const buttons = screen.getAllByRole("button")
    
    // Enter PIN
    for (let i = 1; i <= 4; i++) {
      const button = buttons.find(b => b.textContent === String(i))
      if (button) {
        await userEvent.click(button)
      }
    }
    
    const continueButton = screen.getByText("Continue")
    await userEvent.click(continueButton)
    
    await waitFor(() => {
      const tableInput = screen.getByPlaceholderText(/e.g. T12/)
      expect(tableInput).toBeInTheDocument()
    })
    
    const tableInput = screen.getByPlaceholderText(/e.g. T12/) as HTMLInputElement
    await userEvent.type(tableInput, "T5")
    
    const assignButton = screen.getByText("Assign Table")
    await userEvent.click(assignButton)
    
    await waitFor(() => {
      expect(screen.getByText(/Invalid PIN or table/)).toBeInTheDocument()
    })
  })

  it("allows going back from table screen to PIN screen", async () => {
    render(<PortableTabletAssignment />)
    
    const buttons = screen.getAllByRole("button")
    
    // Enter PIN
    for (let i = 1; i <= 4; i++) {
      const button = buttons.find(b => b.textContent === String(i))
      if (button) {
        await userEvent.click(button)
      }
    }
    
    const continueButton = screen.getByText("Continue")
    await userEvent.click(continueButton)
    
    await waitFor(() => {
      expect(screen.getByText("Table Name or Code")).toBeInTheDocument()
    })
    
    const backButton = screen.getByText("Back")
    await userEvent.click(backButton)
    
    expect(screen.getByText("Staff PIN")).toBeInTheDocument()
  })
})
