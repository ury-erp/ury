import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { DatePicker } from "./date-picker";

// The day cells used to be `<div onClick>`: not focusable, absent from the
// tab order, and impossible to operate from the keyboard at all. These cover
// the grid they became, so that can't quietly regress.

function Harness({ initial = "2026-09-15", maxDate }: { initial?: string; maxDate?: string }) {
  const [value, setValue] = React.useState(initial);
  return (
    <DatePicker
      aria-label="Plan date"
      value={value}
      maxDate={maxDate}
      onChange={(_id, next) => setValue(next)}
    />
  );
}

const open = async () => {
  await userEvent.click(screen.getByLabelText("Plan date"));
  return screen.getByRole("dialog", { name: "Plan date calendar" });
};

describe("DatePicker", () => {
  it("exposes the calendar as a labelled grid of day buttons", async () => {
    render(<Harness />);
    await open();

    expect(screen.getByRole("grid", { name: "September 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "15 September 2026" })).toBeInTheDocument();
    // 30 days in September, each a real button -- the padding cells from the
    // neighbouring months are aria-hidden and must not show up here.
    expect(screen.getAllByRole("gridcell").filter((cell) => cell.querySelector("button"))).toHaveLength(30);
  });

  it("puts exactly one day in the tab order and moves it with the arrow keys", async () => {
    render(<Harness />);
    await open();

    const tabbable = () =>
      screen
        .getAllByRole("button")
        .filter((el) => el.dataset.date && el.tabIndex === 0)
        .map((el) => el.dataset.date);

    expect(tabbable()).toEqual(["2026-09-15"]);
    expect(screen.getByRole("button", { name: "15 September 2026" })).toHaveFocus();

    await userEvent.keyboard("{ArrowRight}");
    expect(tabbable()).toEqual(["2026-09-16"]);
    await userEvent.keyboard("{ArrowDown}");
    expect(tabbable()).toEqual(["2026-09-23"]);
  });

  it("pages to the neighbouring month when the focus walks off the end of this one", async () => {
    render(<Harness initial="2026-09-30" />);
    await open();

    await userEvent.keyboard("{ArrowRight}");

    expect(screen.getByRole("grid", { name: "October 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1 October 2026" })).toHaveFocus();
  });

  it("selects the focused day with the keyboard", async () => {
    render(<Harness />);
    await open();

    await userEvent.keyboard("{ArrowRight}{Enter}");

    expect(screen.getByLabelText("Plan date")).toHaveTextContent("16-09-2026");
  });

  it("disables days past maxDate instead of silently ignoring the click", async () => {
    const onChange = vi.fn();
    render(
      <DatePicker aria-label="Plan date" value="2026-09-15" maxDate="2026-09-20" onChange={onChange} />
    );
    await open();

    expect(screen.getByRole("button", { name: "21 September 2026" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "20 September 2026" })).toBeEnabled();
  });

  it("closes on Escape and hands focus back to the trigger", async () => {
    render(<Harness />);
    await open();

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Plan date")).toHaveFocus();
  });
});
