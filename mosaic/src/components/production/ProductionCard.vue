<template>
  <div
    @click="!disabled && $emit('open')"
    :class="{
      'opacity-50 blur-[1px] cursor-not-allowed': disabled
    }"
    class="rounded-lg transition-all duration-200 cursor-pointer p-4"
    style="background: var(--panel); border: 1px solid var(--hair); font-family: var(--s)"
  >
    <!-- Header -->
    <div class="flex items-center gap-3">
      <div
        class="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
        style="background: var(--ac-t)"
      ></div>

      <div>
        <h2 class="text-base font-semibold" style="color: var(--t1)">
          {{ title }}
        </h2>

        <p class="text-xs" style="color: var(--t3)">
          Production Unit
        </p>
      </div>
    </div>

    <!-- Statistics -->
    <div class="grid grid-cols-3 gap-2 mt-4">

      <!-- Active -->
      <div class="rounded-md p-2 text-center" style="background: var(--ac-t)">
        <div class="text-2xl font-semibold" style="color: var(--ac); font-family: var(--m); font-variant-numeric: tabular-nums">
          {{ activeOrders }}
        </div>

        <div class="text-xs mt-1" style="color: var(--t3)">
          Active
        </div>
      </div>

      <!-- Served -->
      <div class="rounded-md p-2 text-center" style="background: var(--gr-t)">
        <div class="text-2xl font-semibold" style="color: var(--gr); font-family: var(--m); font-variant-numeric: tabular-nums">
          {{ servedOrders }}
        </div>

        <div class="text-xs mt-1" style="color: var(--t3)">
          Served
        </div>
      </div>

      <!-- Total -->
      <div class="rounded-md p-2 text-center" style="background: var(--sunk)">
        <div class="text-2xl font-semibold" style="color: var(--t1); font-family: var(--m); font-variant-numeric: tabular-nums">
          {{ totalOrders }}
        </div>

        <div class="text-xs mt-1" style="color: var(--t3)">
          Total
        </div>
      </div>

    </div>

    <!-- Footer -->
    <div class="mt-4 pt-3" style="border-top: 1px solid var(--hair)">
      <span class="text-xs" style="color: var(--t4)">
        Click to view KOTs
      </span>
    </div>

  </div>
</template>

<script>
export default {
  name: "ProductionCard",

  emits: ["open"],

  props: {
    title: {
      type: String,
      required: true,
    },

    activeOrders: {
      type: Number,
      default: 0,
    },

    servedOrders: {
      type: Number,
      default: 0,
    },

    totalOrders: {
      type: Number,
      default: 0,
    },

    disabled: {
      type: Boolean,
      default: false,
    },
  },
};
</script>