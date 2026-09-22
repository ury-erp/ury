import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SwitchCard } from "./switch-card"

describe("SwitchCard", () => {
  it("toggles when the label or description is clicked", async () => {
    const user = userEvent.setup()
    const onCheckedChange = vi.fn()

    render(
      <SwitchCard
        id="demo"
        label="Set up with demo data"
        description="Adds sample menu and POS data."
        checked={false}
        onCheckedChange={onCheckedChange}
      />
    )

    await user.click(screen.getByText("Set up with demo data"))
    expect(onCheckedChange).toHaveBeenCalledWith(true)

    onCheckedChange.mockClear()
    await user.click(screen.getByText("Adds sample menu and POS data."))
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it("does not toggle when disabled", async () => {
    const user = userEvent.setup()
    const onCheckedChange = vi.fn()

    render(
      <SwitchCard
        label="Disabled option"
        checked={false}
        onCheckedChange={onCheckedChange}
        disabled
      />
    )

    await user.click(screen.getByText("Disabled option"))
    expect(onCheckedChange).not.toHaveBeenCalled()
  })
})
