import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ProductionCard from "./ProductionCard.vue";

describe("ProductionCard", () => {
  it("renders the title and order counts", () => {
    const wrapper = mount(ProductionCard, {
      props: {
        title: "Kitchen",
        activeOrders: 3,
        servedOrders: 12,
        totalOrders: 15,
      },
    });

    expect(wrapper.text()).toContain("Kitchen");
    expect(wrapper.text()).toContain("3");
    expect(wrapper.text()).toContain("12");
    expect(wrapper.text()).toContain("15");
  });

  it("defaults order counts to zero when not provided", () => {
    const wrapper = mount(ProductionCard, {
      props: { title: "Bar" },
    });

    expect(wrapper.text()).toContain("0");
  });

  it("emits 'open' when clicked and not disabled", async () => {
    const wrapper = mount(ProductionCard, {
      props: { title: "Kitchen" },
    });

    await wrapper.trigger("click");

    expect(wrapper.emitted("open")).toBeTruthy();
    expect(wrapper.emitted("open")).toHaveLength(1);
  });

  it("does not emit 'open' when disabled and clicked", async () => {
    const wrapper = mount(ProductionCard, {
      props: { title: "Kitchen", disabled: true },
    });

    await wrapper.trigger("click");

    expect(wrapper.emitted("open")).toBeFalsy();
  });

  it("applies the disabled visual state class", () => {
    const wrapper = mount(ProductionCard, {
      props: { title: "Kitchen", disabled: true },
    });

    expect(wrapper.classes()).toContain("opacity-50");
  });
});
