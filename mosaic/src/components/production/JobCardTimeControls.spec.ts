// V3-62: colocated vitest spec for the standalone, unwired
// JobCardTimeControls.vue component.
//
// This component is not imported by any live component; this spec exercises
// it in isolation via @vue/test-utils, mirroring the co-located
// *.spec.ts convention used elsewhere in this monorepo. See the V3-62 task
// report for whether this suite was actually run (mosaic has no
// node_modules/vitest config checked into this worktree, so it is written
// to run once a runner is available, and the exact reason it could not be
// executed here is disclosed in that report rather than fabricating a
// pass/fail result).

import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import JobCardTimeControls from "./JobCardTimeControls.vue";

describe("JobCardTimeControls", () => {
  it("renders time-logging controls only when eligible", () => {
    const wrapper = mount(JobCardTimeControls, {
      props: {
        itemCode: "ITEM-SAUCE",
        jobCardRef: "JOB-CARD-001",
        employee: "EMP-001",
        eligible: true,
      },
    });

    expect(wrapper.find('[data-testid="job-card-time-controls"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="from-time-input"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="to-time-input"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="log-time-button"]').exists()).toBe(true);
  });

  it("hides controls when not eligible", () => {
    const wrapper = mount(JobCardTimeControls, {
      props: {
        itemCode: "ITEM-PLATE",
        jobCardRef: "",
        employee: "EMP-001",
        eligible: false,
      },
    });

    expect(wrapper.find('[data-testid="job-card-time-controls"]').exists()).toBe(false);
    expect(wrapper.html().trim()).toBe("<!--v-if-->");
  });

  it("calls the injected logChefTime handler with the entered times on submit", async () => {
    const logChefTime = vi.fn().mockResolvedValue({ name: "URYJCTL-0001" });
    const wrapper = mount(JobCardTimeControls, {
      props: {
        itemCode: "ITEM-SAUCE",
        jobCardRef: "JOB-CARD-001",
        employee: "EMP-001",
        eligible: true,
        logChefTime,
      },
    });

    await wrapper.find('[data-testid="from-time-input"]').setValue("2026-08-28T09:00");
    await wrapper.find('[data-testid="to-time-input"]').setValue("2026-08-28T10:00");
    await wrapper.find('[data-testid="log-time-button"]').trigger("click");
    await Promise.resolve();

    expect(logChefTime).toHaveBeenCalledWith({
      jobCardRef: "JOB-CARD-001",
      employee: "EMP-001",
      fromTime: "2026-08-28T09:00",
      toTime: "2026-08-28T10:00",
    });
    expect(wrapper.emitted("logged")).toBeTruthy();
  });
});
