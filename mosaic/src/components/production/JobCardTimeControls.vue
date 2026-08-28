<template>
  <div
    v-if="eligible"
    data-testid="job-card-time-controls"
    class="bg-white rounded-2xl border border-gray-200 shadow-sm p-5"
  >
    <div class="flex items-center gap-3">
      <div
        class="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-xl"
      >
        ⏱️
      </div>

      <div>
        <h3 class="text-lg font-bold text-gray-800">
          Chef Time Logging
        </h3>

        <p class="text-xs text-gray-500">
          {{ itemCode }} — selective Job Card usage (batch-eligible, opted in)
        </p>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3 mt-4">
      <div>
        <label class="block text-xs text-gray-500 mb-1">From</label>
        <input
          v-model="fromTime"
          type="datetime-local"
          data-testid="from-time-input"
          class="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm"
        />
      </div>

      <div>
        <label class="block text-xs text-gray-500 mb-1">To</label>
        <input
          v-model="toTime"
          type="datetime-local"
          data-testid="to-time-input"
          class="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm"
        />
      </div>
    </div>

    <button
      type="button"
      data-testid="log-time-button"
      class="mt-4 w-full bg-amber-500 text-white text-sm font-semibold rounded-lg py-2 hover:bg-amber-600 transition-colors"
      @click="onLogTime"
    >
      Log Chef Time
    </button>
  </div>
</template>

<script>
/**
 * V3-62: Standalone, UNWIRED Job Card time-logging controls.
 *
 * This component is not imported by, and does not import, any live
 * component (kot.vue, ProductionCard.vue, ProductionDashboard.vue, etc.) --
 * it exists to demonstrate that selective/opt-in Job Card chef time
 * logging *can* be surfaced in the UI, without being wired into anything
 * (same pattern as the backend module it calls,
 * ury.ury.api.ury_job_card_controls).
 *
 * Controls render ONLY when `eligible` is true. Eligibility is computed by
 * the caller (via the backend's `is_job_card_eligible`, a strict subset of
 * V3-61's `is_batch_eligible`) and passed in as a prop -- this component
 * never invents its own eligibility rule and never forces Job Card usage
 * onto every item. When `eligible` is false, the component renders nothing.
 *
 * `logChefTime` defaults to a stub that returns a resolved promise so this
 * component works in isolation (including in tests) without a live
 * backend; a real integration would pass in a function that calls
 * `ury.ury.api.ury_job_card_controls.log_chef_time` via frappe-js-sdk.
 */
export default {
  name: "JobCardTimeControls",

  emits: ["logged", "error"],

  props: {
    itemCode: {
      type: String,
      required: true,
    },

    jobCardRef: {
      type: String,
      default: "",
    },

    employee: {
      type: String,
      default: "",
    },

    eligible: {
      type: Boolean,
      default: false,
    },

    logChefTime: {
      type: Function,
      default: null,
    },
  },

  data() {
    return {
      fromTime: "",
      toTime: "",
    };
  },

  methods: {
    async onLogTime() {
      const submit = this.logChefTime || this.defaultLogChefTime;
      try {
        const result = await submit({
          jobCardRef: this.jobCardRef,
          employee: this.employee,
          fromTime: this.fromTime,
          toTime: this.toTime,
        });
        this.$emit("logged", result);
      } catch (err) {
        this.$emit("error", err);
      }
    },

    defaultLogChefTime(payload) {
      return Promise.resolve(payload);
    },
  },
};
</script>
