import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import POSOpeningDialog from "./POSOpeningDialog";

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

describe("POSOpeningDialog", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders the opening dialog with refresh icon for opening type", () => {
    render(
      <POSOpeningDialog onReload={() => {}} type="opening" />
    );
    expect(screen.getByText("pos.not_opened_title")).toBeInTheDocument();
    expect(screen.getByText("pos.not_opened_message")).toBeInTheDocument();
  });

  it("renders the closing dialog with alert icon for closing type", () => {
    render(
      <POSOpeningDialog onReload={() => {}} type="closing" />
    );
    expect(screen.getByText("pos.not_closed_title")).toBeInTheDocument();
    expect(screen.getByText("pos.not_closed_message")).toBeInTheDocument();
  });

  it("renders the reload button with text for opening type", () => {
    render(
      <POSOpeningDialog onReload={() => {}} type="opening" />
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
    expect(screen.getByText("pos.reload_page")).toBeInTheDocument();
  });

  it("calls onReload when the reload button is clicked", async () => {
    const onReload = vi.fn();
    render(
      <POSOpeningDialog onReload={onReload} type="opening" />
    );
    
    await userEvent.click(screen.getByRole("button"));
    
    expect(onReload).toHaveBeenCalled();
  });

  it("displays recovery guidance text", () => {
    render(
      <POSOpeningDialog onReload={() => {}} type="opening" />
    );
    expect(screen.getByText("pos.contact_manager")).toBeInTheDocument();
  });

  it("renders with destructive-tint background for opening issue", () => {
    const { container } = render(
      <POSOpeningDialog onReload={() => {}} type="opening" />
    );
    const iconContainer = container.querySelector(".bg-destructive-tint");
    expect(iconContainer).toBeInTheDocument();
  });

  it("renders with warning-tint background for closing issue", () => {
    const { container } = render(
      <POSOpeningDialog onReload={() => {}} type="closing" />
    );
    const iconContainer = container.querySelector(".bg-warning-tint");
    expect(iconContainer).toBeInTheDocument();
  });
});
