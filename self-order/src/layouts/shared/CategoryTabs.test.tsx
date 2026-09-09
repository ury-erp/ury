import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import CategoryTabs from "./CategoryTabs"

describe("CategoryTabs", () => {
  const categories = [
    { course: "MAIN", course_label: "Main Courses" },
    { course: "SIDE", course_label: "Sides" },
    { course: "DESSERT", course_label: "Desserts" },
  ]

  it("renders All button", () => {
    render(<CategoryTabs categories={categories} activeCourse={null} onSelect={vi.fn()} />)
    expect(screen.getByText("All")).toBeInTheDocument()
  })

  it("renders category buttons for each category", () => {
    render(<CategoryTabs categories={categories} activeCourse={null} onSelect={vi.fn()} />)

    expect(screen.getByText("Main Courses")).toBeInTheDocument()
    expect(screen.getByText("Sides")).toBeInTheDocument()
    expect(screen.getByText("Desserts")).toBeInTheDocument()
  })

  it("highlights the All button when activeCourse is null", () => {
    render(<CategoryTabs categories={categories} activeCourse={null} onSelect={vi.fn()} />)

    const allButton = screen.getByText("All")
    expect(allButton).toHaveClass("bg-primary", "text-primary-foreground")
  })

  it("highlights the active category button", () => {
    render(<CategoryTabs categories={categories} activeCourse="MAIN" onSelect={vi.fn()} />)

    const mainButton = screen.getByText("Main Courses")
    expect(mainButton).toHaveClass("bg-primary", "text-primary-foreground")

    const sidesButton = screen.getByText("Sides")
    expect(sidesButton).not.toHaveClass("bg-primary")
  })

  it("calls onSelect with null when All button is clicked", async () => {
    const onSelect = vi.fn()
    render(<CategoryTabs categories={categories} activeCourse="MAIN" onSelect={onSelect} />)

    await userEvent.click(screen.getByText("All"))
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it("calls onSelect with course code when category is clicked", async () => {
    const onSelect = vi.fn()
    render(<CategoryTabs categories={categories} activeCourse={null} onSelect={onSelect} />)

    await userEvent.click(screen.getByText("Main Courses"))
    expect(onSelect).toHaveBeenCalledWith("MAIN")

    await userEvent.click(screen.getByText("Sides"))
    expect(onSelect).toHaveBeenCalledWith("SIDE")
  })

  it("renders with empty categories list", () => {
    render(<CategoryTabs categories={[]} activeCourse={null} onSelect={vi.fn()} />)
    expect(screen.getByText("All")).toBeInTheDocument()
  })

  it("includes nav with aria-label", () => {
    render(<CategoryTabs categories={categories} activeCourse={null} onSelect={vi.fn()} />)
    expect(screen.getByLabelText("Menu categories")).toBeInTheDocument()
  })
})
