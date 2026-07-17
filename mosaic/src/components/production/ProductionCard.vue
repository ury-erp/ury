<template>
  <div
    @click="$emit('open')"
    class="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer p-5"
  >
    <!-- Header -->
    <div class="flex justify-between items-start">
      <div class="flex items-center gap-3">
        <div
          class="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-2xl"
        >
          🍳
        </div>

        <div>
          <h2 class="text-xl font-bold text-gray-800">
            {{ title }}
          </h2>

          <p class="text-sm text-gray-500">
            Production Unit
          </p>
        </div>
      </div>

      <span
        class="bg-green-100 text-green-700 text-xs font-semibold px-3 py-1 rounded-full"
      >
        Live
      </span>
    </div>

    <!-- Statistics -->
    <div class="grid grid-cols-3 gap-3 mt-6">

      <!-- Active -->
      <div class="bg-blue-50 rounded-xl p-3 text-center">
        <div class="text-3xl font-bold text-blue-700">
          {{ activeOrders }}
        </div>

        <div class="text-xs text-gray-500 mt-1">
          Active
        </div>
      </div>

      <!-- Served -->
      <div class="bg-green-50 rounded-xl p-3 text-center">
        <div class="text-3xl font-bold text-green-600">
          {{ servedOrders }}
        </div>

        <div class="text-xs text-gray-500 mt-1">
          Served
        </div>
      </div>

      <!-- Total -->
      <div class="bg-slate-100 rounded-xl p-3 text-center">
        <div class="text-3xl font-bold text-slate-700">
          {{ totalOrders }}
        </div>

        <div class="text-xs text-gray-500 mt-1">
          Total
        </div>
      </div>

    </div>

    <!-- Footer -->
    <div class="mt-6 flex justify-between items-center border-t pt-4">
      <span class="text-xs text-gray-400">
        Click to view KOTs
      </span>

      <span class="text-blue-600 font-semibold">
        View →
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
  },
};
</script>