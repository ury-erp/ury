import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrderStatusSidebar from "./OrderStatusSidebar";

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => ({
    posProfile: {
      view_all_status: false,
      paid_limit: 30,
    },
  }),
}));

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

describe("OrderStatusSidebar", () => {
  it("renders the status sidebar with title", () => {
    const setSelectedStatus = vi.fn();
    render(
      <OrderStatusSidebar
        selectedStatus="Draft"
        setSelectedStatus={setSelectedStatus}
      />
    );

    expect(screen.getByText("orders.status_title")).toBeInTheDocument();
  });

  it("renders status buttons based on configuration", () => {
    const setSelectedStatus = vi.fn();
    render(
      <OrderStatusSidebar
        selectedStatus="Draft"
        setSelectedStatus={setSelectedStatus}
      />
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("calls setSelectedStatus when a status is clicked", async () => {
    const setSelectedStatus = vi.fn();
    render(
      <OrderStatusSidebar
        selectedStatus="Draft"
        setSelectedStatus={setSelectedStatus}
      />
    );

    const buttons = screen.getAllByRole("button");
    await userEvent.click(buttons[0]);
    expect(setSelectedStatus).toHaveBeenCalled();
  });

  it("applies disabled state when disabled prop is true", () => {
    const setSelectedStatus = vi.fn();
    const { container } = render(
      <OrderStatusSidebar
        selectedStatus="Draft"
        setSelectedStatus={setSelectedStatus}
        disabled={true}
      />
    );

    const sidebar = container.querySelector(".opacity-50");
    expect(sidebar).toBeInTheDocument();
  });

  it("highlights the selected status", () => {
    const setSelectedStatus = vi.fn();
    render(
      <OrderStatusSidebar
        selectedStatus="Draft"
        setSelectedStatus={setSelectedStatus}
      />
    );

    const buttons = screen.getAllByRole("button");
    const activeButton = buttons.find((btn) =>
      btn.classList.contains("bg-white")
    );
    expect(activeButton).toBeInTheDocument();
  });
});
