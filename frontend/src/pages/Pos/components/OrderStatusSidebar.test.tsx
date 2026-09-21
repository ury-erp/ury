import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OrderStatusSidebar from "./OrderStatusSidebar";

vi.mock("../data/order-types", () => ({
  getOrderStatusTypes: vi.fn().mockReturnValue([
    { value: "Pending" },
    { value: "Confirmed" },
    { value: "Completed" },
  ]),
}));

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => ({
    posProfile: { view_all_status: false, paid_limit: 100 },
  }),
}));

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

describe("OrderStatusSidebar", () => {
  const mockSetSelectedStatus = vi.fn();

  beforeEach(() => {
    mockSetSelectedStatus.mockClear();
  });

  it("renders with correct structure", () => {
    const { container } = render(
      <OrderStatusSidebar
        selectedStatus="Pending"
        setSelectedStatus={mockSetSelectedStatus}
      />
    );
    expect(container.querySelector(".w-64")).toBeInTheDocument();
  });

  it("renders sidebar container with bg-card class", () => {
    const { container } = render(
      <OrderStatusSidebar
        selectedStatus="Pending"
        setSelectedStatus={mockSetSelectedStatus}
      />
    );
    const sidebar = container.querySelector(".bg-card");
    expect(sidebar).toBeInTheDocument();
  });

  it("renders buttons for each status type", () => {
    render(
      <OrderStatusSidebar
        selectedStatus="Pending"
        setSelectedStatus={mockSetSelectedStatus}
      />
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });

  it("calls setSelectedStatus when a status button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <OrderStatusSidebar
        selectedStatus="Pending"
        setSelectedStatus={mockSetSelectedStatus}
      />
    );

    const buttons = screen.getAllByRole("button");
    if (buttons.length > 1) {
      await user.click(buttons[1]);
      expect(mockSetSelectedStatus).toHaveBeenCalled();
    }
  });

  it("disables sidebar with opacity-50 when disabled prop is true", () => {
    const { container } = render(
      <OrderStatusSidebar
        selectedStatus="Pending"
        setSelectedStatus={mockSetSelectedStatus}
        disabled={true}
      />
    );

    const sidebar = container.querySelector(".opacity-50");
    expect(sidebar).toBeInTheDocument();
  });

  it("prevents interaction when disabled prop is true", () => {
    const { container } = render(
      <OrderStatusSidebar
        selectedStatus="Pending"
        setSelectedStatus={mockSetSelectedStatus}
        disabled={true}
      />
    );

    const disabledContainer = container.querySelector(".pointer-events-none");
    expect(disabledContainer).toBeInTheDocument();
  });
});
