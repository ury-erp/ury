<template>
  <!--
    Recall: put a ticket that was served by mistake back on the board.

    A bump bar is one tap away from a hot pan, and before this the only undo
    lived in the Frappe Desk UI — which no kitchen has open. Tickets served in
    the last three hours are listed newest first, because a mis-tap is noticed
    within seconds, not hours.
  -->
  <transition name="kds-sheet">
    <div v-if="open" class="fixed inset-0 z-50 flex justify-end bg-[#241914]/60 backdrop-blur-sm" @click.self="$emit('close')">
      <aside class="flex h-full w-full max-w-md flex-col bg-[#fffdf8] shadow-2xl" role="dialog" :aria-label="$t('recall.title')">
        <header class="flex items-center justify-between border-b border-[#eadfce] px-5 py-4">
          <div>
            <h3 class="text-lg font-bold text-[#3f2a20]">{{ $t('recall.title') }}</h3>
            <p class="text-xs font-semibold text-[#9a7e6b]">{{ $t('recall.subtitle') }}</p>
          </div>
          <button
            type="button"
            class="press rounded-lg px-3 py-1.5 text-xl font-bold text-[#735d4e] hover:bg-[#f7f1e6]"
            @click="$emit('close')"
            :aria-label="$t('recall.close')"
          >✕</button>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <p v-if="loading" class="py-10 text-center text-sm font-semibold text-[#9a7e6b]">
            {{ $t('recall.loading') }}
          </p>

          <div v-else-if="error" role="alert" class="py-10 text-center">
            <p class="font-semibold text-red-700">{{ $t('recall.load_failed') }}</p>
            <button type="button" class="press mt-3 min-h-[48px] rounded-lg border px-4 font-bold" @click="$emit('retry')">{{ $t('kot.retry') }}</button>
          </div>

          <p v-else-if="!tickets.length" class="py-10 text-center text-sm font-semibold text-[#9a7e6b]">
            {{ $t('recall.empty') }}
          </p>

          <ul v-else class="space-y-3">
            <li
              v-for="ticket in tickets"
              :key="ticket.name"
              class="rounded-xl border border-[#eadfce] bg-white px-4 py-3"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate font-bold text-[#3f2a20]">{{ destination(ticket) }}</p>
                  <p class="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#9a7e6b] bidi-isolate">
                    {{ $t('kot.order') }}
                    {{ dailyOrderNumber ? ticket.order_no : String(ticket.invoice || '').slice(-4) }}
                    <span v-if="ticket.start_time_serv"> · {{ ticket.start_time_serv }}</span>
                  </p>
                  <p class="mt-1 truncate text-xs text-[#735d4e]">
                    {{ itemSummary(ticket) }}
                  </p>
                </div>

                <button
                  type="button"
                  class="press shrink-0 rounded-lg bg-[#ffca4b] px-4 py-2 text-sm font-bold text-[#3f2a20] hover:bg-[#ffd66f] disabled:opacity-50"
                  :disabled="busy === ticket.name"
                  @click="$emit('recall', ticket)"
                >
                  {{ busy === ticket.name ? $t('recall.restoring') : $t('recall.restore') }}
                </button>
              </div>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  </transition>
</template>

<script>
export default {
  name: "RecallPanel",
  props: {
    open: { type: Boolean, default: false },
    tickets: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false },
    error: { type: Boolean, default: false },
    busy: { type: String, default: "" },
    dailyOrderNumber: { type: [Number, Boolean], default: 0 },
  },
  emits: ["close", "recall", "retry"],
  methods: {
    destination(ticket) {
      if (!ticket.restaurant_table || ticket.table_takeaway) return this.$t("kot.takeaway");
      return ticket.restaurant_table;
    },
    /** First few item names, so a cook recognises the ticket without opening it. */
    itemSummary(ticket) {
      const items = ticket.kot_items || [];
      const names = items.slice(0, 3).map((i) => `${i.quantity}× ${i.item_name}`);
      if (items.length > 3) names.push(`+${items.length - 3}`);
      return names.join(" · ") || "—";
    },
  },
};
</script>

<style scoped>
/* The sheet slides from the inline end, so it enters from the right in an
   LTR kitchen and from the left in an RTL one without a second rule. */
.kds-sheet-enter-active,
.kds-sheet-leave-active { transition: opacity var(--duration-base) var(--ease-out); }
.kds-sheet-enter-from,
.kds-sheet-leave-to { opacity: 0; }
.kds-sheet-enter-active aside,
.kds-sheet-leave-active aside { transition: transform var(--duration-base) var(--ease-out); }
.kds-sheet-enter-from aside,
.kds-sheet-leave-to aside { transform: translateX(100%); }
[dir="rtl"] .kds-sheet-enter-from aside,
[dir="rtl"] .kds-sheet-leave-to aside { transform: translateX(-100%); }
</style>
