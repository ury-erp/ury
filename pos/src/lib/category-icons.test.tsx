import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fuzzyMatchIcon, CategoryIcon } from "./category-icons";

describe("fuzzyMatchIcon", () => {
  it("matches pizza course", () => {
    expect(fuzzyMatchIcon("Pizza")).toBe("Pizza");
    expect(fuzzyMatchIcon("Pizzas")).toBe("Pizza");
  });

  it("matches burger course", () => {
    expect(fuzzyMatchIcon("Burger")).toBe("Hamburger");
    expect(fuzzyMatchIcon("Hamburger")).toBe("Hamburger");
  });

  it("matches ice cream", () => {
    expect(fuzzyMatchIcon("Ice Cream")).toBe("IceCreamCone");
    expect(fuzzyMatchIcon("ice-cream")).toBe("IceCreamCone");
  });

  it("matches soup", () => {
    expect(fuzzyMatchIcon("Soup")).toBe("Soup");
    expect(fuzzyMatchIcon("Soups")).toBe("Soup");
  });

  it("matches drinks", () => {
    expect(fuzzyMatchIcon("Coffee")).toBe("Coffee");
    expect(fuzzyMatchIcon("Tea")).toBe("Coffee");
    expect(fuzzyMatchIcon("Soda")).toBe("CupSoda");
    expect(fuzzyMatchIcon("Juice")).toBe("CupSoda");
  });

  it("matches proteins", () => {
    expect(fuzzyMatchIcon("Chicken")).toBe("Drumstick");
    expect(fuzzyMatchIcon("Beef")).toBe("Beef");
    expect(fuzzyMatchIcon("Fish")).toBe("Fish");
  });

  it("matches desserts", () => {
    expect(fuzzyMatchIcon("Cake")).toBe("Cake");
    expect(fuzzyMatchIcon("Donut")).toBe("Donut");
    expect(fuzzyMatchIcon("Cookie")).toBe("Cookie");
  });

  it("returns undefined for unknown course", () => {
    expect(fuzzyMatchIcon("UnknownDish")).toBeUndefined();
  });

  it("returns undefined for empty course", () => {
    expect(fuzzyMatchIcon("")).toBeUndefined();
    expect(fuzzyMatchIcon(undefined)).toBeUndefined();
  });

  it("handles compound names", () => {
    expect(fuzzyMatchIcon("Chicken Pizza")).toBe("Pizza");
    expect(fuzzyMatchIcon("Smash Burger")).toBe("Hamburger");
  });
});

describe("CategoryIcon", () => {
  it("renders icon for known icon name", () => {
    const { container } = render(<CategoryIcon name="Pizza" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("uses fallback when no name provided", () => {
    const { container } = render(<CategoryIcon courseName="Pizza" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("applies className to icon", () => {
    const { container } = render(<CategoryIcon name="Pizza" className="text-red-500" />);
    const svg = container.querySelector("svg");
    expect(svg?.classList.contains("text-red-500")).toBe(true);
  });

  it("renders default icon for unknown course", () => {
    const { container } = render(<CategoryIcon courseName="UnknownDish" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("handles undefined inputs gracefully", () => {
    const { container } = render(<CategoryIcon />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });
});
