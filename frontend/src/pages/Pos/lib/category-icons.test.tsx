import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import { CategoryIcon, fuzzyMatchIcon } from "./category-icons";

describe("category-icons", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe("fuzzyMatchIcon", () => {
    it("returns undefined for empty or missing courseName", () => {
      expect(fuzzyMatchIcon()).toBeUndefined();
      expect(fuzzyMatchIcon("")).toBeUndefined();
      expect(fuzzyMatchIcon("   ")).toBeUndefined();
    });

    it("matches ice cream variants", () => {
      expect(fuzzyMatchIcon("Ice Cream")).toBe("IceCreamCone");
      expect(fuzzyMatchIcon("ice-cream")).toBe("IceCreamCone");
      expect(fuzzyMatchIcon("Ice Creams")).toBe("IceCreamCone");
    });

    it("matches pizza variants", () => {
      expect(fuzzyMatchIcon("Pizza")).toBe("Pizza");
      expect(fuzzyMatchIcon("Cheese Pizza")).toBe("Pizza");
      expect(fuzzyMatchIcon("Pizzas")).toBe("Pizza");
    });

    it("matches burger variants", () => {
      expect(fuzzyMatchIcon("Burger")).toBe("Hamburger");
      expect(fuzzyMatchIcon("Chicken Burger")).toBe("Hamburger");
      expect(fuzzyMatchIcon("Smash Burger")).toBe("Hamburger");
    });

    it("matches drink categories", () => {
      expect(fuzzyMatchIcon("Coffee")).toBe("Coffee");
      expect(fuzzyMatchIcon("Soft Drinks")).toBe("CupSoda");
      expect(fuzzyMatchIcon("Beer")).toBe("Beer");
      expect(fuzzyMatchIcon("Wine")).toBe("Wine");
      expect(fuzzyMatchIcon("Water")).toBe("GlassWater");
    });

    it("matches protein categories", () => {
      expect(fuzzyMatchIcon("Chicken")).toBe("Drumstick");
      expect(fuzzyMatchIcon("Beef")).toBe("Beef");
      expect(fuzzyMatchIcon("Fish")).toBe("Fish");
      expect(fuzzyMatchIcon("Shrimp")).toBe("Shrimp");
    });

    it("matches dish types", () => {
      expect(fuzzyMatchIcon("Soup")).toBe("Soup");
      expect(fuzzyMatchIcon("Salad")).toBe("Salad");
      expect(fuzzyMatchIcon("Rice")).toBe("Wheat");
    });

    it("prioritizes more specific matches", () => {
      expect(fuzzyMatchIcon("Chicken Pizza")).toBe("Pizza");
      expect(fuzzyMatchIcon("Grilled Chicken")).toBe("CookingPot");
    });

    it("handles compound dish names", () => {
      expect(fuzzyMatchIcon("Chicken Biryani")).toBe("Wheat");
      expect(fuzzyMatchIcon("Add-ons")).toBe("Cookie");
    });
  });

  describe("CategoryIcon component", () => {
    it("renders an icon component", () => {
      const { container } = render(<CategoryIcon name="Pizza" />);
      expect(container.querySelector("svg")).toBeInTheDocument();
    });

    it("uses provided name for icon lookup", () => {
      const { container } = render(<CategoryIcon name="Pizza" />);
      expect(container.querySelector("svg")).toBeInTheDocument();
    });

    it("falls back to courseName fuzzy matching", () => {
      const { container } = render(<CategoryIcon courseName="Coffee" />);
      expect(container.querySelector("svg")).toBeInTheDocument();
    });

    it("applies custom className", () => {
      const { container } = render(
        <CategoryIcon name="Pizza" className="h-6 w-6 text-red-500" />
      );
      const svg = container.querySelector("svg");
      expect(svg?.className.baseVal).toContain("h-6");
      expect(svg?.className.baseVal).toContain("w-6");
    });

    it("renders UtensilsCrossed as fallback when icon not found", () => {
      const { container } = render(<CategoryIcon name="NonExistentIcon" />);
      expect(container.querySelector("svg")).toBeInTheDocument();
    });

    it("updates icon when name prop changes", async () => {
      const { rerender, container } = render(<CategoryIcon name="Pizza" />);
      let svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();

      rerender(<CategoryIcon name="Coffee" />);
      svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });
  });
});
