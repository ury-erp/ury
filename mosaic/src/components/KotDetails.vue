<template>
  <div
    v-if="open"
    class="fixed inset-0 z-[90] flex items-end justify-center bg-[#241914]/70 p-0 backdrop-blur-sm sm:items-center sm:p-6 animate-fade-in"
    role="dialog"
    aria-modal="true"
    :aria-label="$t('details.title')"
    @click.self="$emit('close')"
  >
    <div
      class="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-[#fffdf8] shadow-2xl sm:max-h-[86vh] sm:max-w-2xl sm:rounded-3xl animate-scale-in"
    >
      <!-- Header stays put while the body scrolls -->
      <header class="flex items-start justify-between gap-4 border-b border-[#eadfce] px-6 py-4">
        <div class="min-w-0">
          <p class="truncate text-xl font-bold text-[#3f2a20]">{{ destination }}</p>
          <p class="mt-1 flex flex-wrap items-center gap-x-2 text-xs font-semibold uppercase tracking-wider text-[#9a7e6b]">
            <span class="bidi-isolate">{{ $t('kot.order') }} {{ orderRef }}</span>
            <span v-if="statusText">· {{ statusText }}</span>
          </p>
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <span
            v-if="elapsed"
            :class="kot && kot.timecolor"
            class="rounded-xl bg-white px-3 py-1.5 text-xl font-bold leading-none tabular-nums bidi-isolate"
          >{{ elapsed }}</span>
          <button
            type="button"
            @click="$emit('close')"
            class="press rounded-lg px-2.5 py-2 text-lg font-bold text-[#9a7e6b] transition-colors duration-fast hover:bg-[#f7f1e6] hover:text-[#3f2a20]"
            :aria-label="$t('details.close')"
          >&#10005;</button>
        </div>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <p v-if="loading" class="py-10 text-center text-sm text-[#9a7e6b]">{{ $t('details.loading') }}</p>
        <p v-else-if="error" class="py-10 text-center text-sm font-semibold text-[#c83d2d]">{{ $t('details.failed') }}</p>

        <div v-else class="space-y-6">
          <!-- Kitchen note first: if there is one, it changes how the food is made -->
          <p v-if="kot && kot.comments" class="rounded-xl border border-[#f0d58e] bg-[#fff8e8] px-4 py-3 text-sm font-semibold text-[#735d4e]">
            <span class="block text-[11px] font-bold uppercase tracking-wider text-[#9a7e6b]">{{ $t('details.kitchen_note') }}</span>
            {{ kot.comments }}
          </p>

          <section>
            <h3 class="section-heading">{{ $t('details.section_order') }}</h3>
            <dl class="detail-grid">
              <div v-for="row in orderRows" :key="row.label" class="detail-row">
                <dt class="detail-label">{{ row.label }}</dt>
                <dd class="detail-value" :class="row.isolate ? 'bidi-isolate' : ''">{{ row.value }}</dd>
              </div>
            </dl>
          </section>

          <section>
            <h3 class="section-heading">{{ $t('details.section_timing') }}</h3>
            <dl class="detail-grid">
              <div v-for="row in timingRows" :key="row.label" class="detail-row">
                <dt class="detail-label">{{ row.label }}</dt>
                <dd class="detail-value bidi-isolate">{{ row.value }}</dd>
              </div>
            </dl>
          </section>

          <section>
            <h3 class="section-heading">
              {{ $t('details.section_items') }}
              <span class="ms-2 text-[#9a7e6b]">{{ $t('kot.items_count', { count: items.length }) }}</span>
            </h3>
            <ul class="divide-y divide-[#eadfce] rounded-xl border border-[#eadfce] bg-white">
              <li v-for="item in items" :key="item.name" class="flex items-start justify-between gap-3 px-4 py-3">
                <div class="min-w-0">
                  <p class="text-base font-semibold text-[#3f2a20]">{{ item.item_name }}</p>
                  <p v-if="item.course" class="mt-0.5 text-xs text-[#9a7e6b]">{{ item.course }}</p>
                  <p v-if="item.comments" class="mt-1 rounded-md bg-[#fffdf8] px-2 py-1 text-xs font-medium text-[#735d4e]">
                    <span class="font-bold text-[#9a7e6b]">{{ $t('details.item_note') }}:</span> {{ item.comments }}
                  </p>
                  <p v-if="item.cancelled_qty" class="mt-1 text-xs font-semibold text-[#c83d2d] bidi-isolate">
                    {{ $t('details.cancelled_qty') }}: {{ item.cancelled_qty }}
                  </p>
                </div>
                <span class="inline-flex h-8 min-w-[2rem] shrink-0 items-center justify-center rounded-lg bg-[#f7f1e6] px-2 text-lg font-bold text-[#3f2a20] tabular-nums">
                  {{ item.quantity }}
                </span>
              </li>
            </ul>
          </section>

          <section>
            <h3 class="section-heading">{{ $t('details.section_meta') }}</h3>
            <dl class="detail-grid">
              <div v-for="row in metaRows" :key="row.label" class="detail-row">
                <dt class="detail-label">{{ row.label }}</dt>
                <dd class="detail-value bidi-isolate">{{ row.value }}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>

      <footer class="flex items-center justify-end gap-3 border-t border-[#eadfce] bg-white/60 px-6 py-4">
        <button
          type="button"
          @click="$emit('close')"
          class="press rounded-xl border border-[#eadfce] px-5 py-2.5 font-semibold text-[#735d4e] transition-colors duration-fast hover:bg-[#f7f1e6]"
        >{{ $t('details.close') }}</button>
        <button
          v-if="kot"
          type="button"
          @click="$emit('action', kot)"
          class="press rounded-xl bg-[#ffca4b] px-6 py-2.5 font-bold text-[#3f2a20] shadow-md transition-colors duration-fast hover:bg-[#ffd66f]"
        >{{ actionLabel }}</button>
      </footer>
    </div>
  </div>
</template>

<script>
/**
 * Full detail for one kitchen ticket.
 *
 * The board card shows only what a cook needs at a glance; this is where the
 * rest lives — guests, order type, waiter, room, timings and the invoice
 * reference. The order context comes from the POS Invoice, which the board
 * payload does not carry, so it is fetched when the sheet opens rather than
 * on every refresh of the board.
 */
export default {
  name: "KotDetails",
  props: {
    open: { type: Boolean, default: false },
    /** The ticket from the board; used for instant render before the fetch lands. */
    kot: { type: Object, default: null },
    dailyOrderNumber: { type: [Number, Boolean], default: 0 },
  },
  emits: ["close", "action"],
  data() {
    return { details: null, loading: false, error: false };
  },
  computed: {
    invoice() {
      return (this.details && this.details.invoice) || {};
    },
    items() {
      // Prefer the fetched copy, but fall back to the board's so the sheet is
      // never empty while the request is in flight.
      const source = (this.details && this.details.kot) || this.kot || {};
      return source.kot_items || [];
    },
    destination() {
      if (!this.kot) return "";
      return this.kot.tableortakeaway === "Takeaway"
        ? this.$t("kot.takeaway")
        : this.kot.tableortakeaway;
    },
    orderRef() {
      if (!this.kot) return "";
      return this.dailyOrderNumber
        ? this.kot.order_no
        : String(this.kot.invoice || "").slice(-4);
    },
    statusText() {
      if (!this.kot || !this.kot.type) return "";
      const key = `kot.status.${this.kot.type}`;
      const label = this.$t(key);
      return label === key ? this.kot.type : label;
    },
    elapsed() {
      return this.kot && this.kot.timeRemaining;
    },
    actionLabel() {
      const cancelled =
        this.kot &&
        (this.kot.type === "Cancelled" || this.kot.type === "Partially cancelled");
      return cancelled ? this.$t("kot.confirm") : this.$t("kot.serve");
    },
    orderRows() {
      const dash = this.$t("details.no_value");
      const inv = this.invoice;
      const d = this.details || {};
      const rows = [
        { label: this.$t("details.customer"), value: inv.customer || (this.kot && this.kot.customer_name) || dash },
        { label: this.$t("details.order_type"), value: inv.order_type || dash },
        { label: this.$t("details.pax"), value: inv.no_of_pax || dash, isolate: true },
        { label: this.$t("details.waiter"), value: inv.waiter || (this.kot && this.kot.user) || dash },
      ];
      if (d.room) rows.push({ label: this.$t("details.room"), value: d.room });
      if (d.seats) rows.push({ label: this.$t("details.seats"), value: d.seats, isolate: true });
      if (inv.mobile_number) rows.push({ label: this.$t("details.mobile"), value: inv.mobile_number, isolate: true });
      if (this.kot && this.kot.custom_merged_tables) {
        rows.push({ label: this.$t("details.merged"), value: this.kot.custom_merged_tables });
      }
      if (this.kot && this.kot.is_aggregator) {
        rows.push({ label: this.$t("details.aggregator"), value: this.kot.customer_name || dash });
        if (this.kot.aggregator_id) {
          rows.push({ label: this.$t("details.aggregator_id"), value: this.kot.aggregator_id, isolate: true });
        }
      }
      if (inv.grand_total != null) {
        rows.push({
          label: this.$t("details.total"),
          value: `${this.formatNumber(inv.grand_total)} ${inv.currency || ""}`.trim(),
          isolate: true,
        });
      }
      return rows;
    },
    timingRows() {
      const dash = this.$t("details.no_value");
      const t = (this.details && this.details.timeline) || {};
      return [
        { label: this.$t("details.placed"), value: this.clock(t.placed) || dash },
        { label: this.$t("details.waiting"), value: this.elapsed || dash },
        { label: this.$t("details.prep_started"), value: this.clock(t.prep_started) || dash },
        { label: this.$t("details.serving_started"), value: this.clock(t.serving_started) || dash },
        { label: this.$t("details.production_time"), value: t.production_time || dash },
      ];
    },
    metaRows() {
      const dash = this.$t("details.no_value");
      const k = this.kot || {};
      const rows = [
        { label: this.$t("details.kot_id"), value: k.name || dash },
        { label: this.$t("details.invoice"), value: k.invoice || dash },
        { label: this.$t("details.station"), value: k.production || dash },
        { label: this.$t("details.status"), value: k.order_status || dash },
        { label: this.$t("details.sent_by"), value: k.user || dash },
      ];
      if (k.verified_by) rows.push({ label: this.$t("details.sent_by"), value: k.verified_by });
      return rows;
    },
  },
  methods: {
    /** Grouped digits, Western numerals, following the active locale. */
    formatNumber(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return value;
      const locale = document.documentElement.lang === "ar" ? "ar-IQ-u-nu-latn" : undefined;
      return n.toLocaleString(locale, { maximumFractionDigits: 2 });
    },
    /** "2026-09-18 02:57:44" or "02:57:44" -> "02:57". */
    clock(value) {
      if (!value) return null;
      const time = String(value).includes(" ") ? String(value).split(" ")[1] : String(value);
      const parts = time.split(":");
      return parts.length >= 2 ? `${parts[0].padStart(2, "0")}:${parts[1]}` : time;
    },
    async load() {
      if (!this.kot) return;
      this.loading = true;
      this.error = false;
      try {
        const res = await fetch(
          `/api/method/ury.ury.api.ury_kot_display.get_kot_details?name=${encodeURIComponent(this.kot.name)}`,
          { credentials: "include" }
        );
        if (!res.ok) throw new Error(String(res.status));
        this.details = (await res.json()).message;
      } catch (err) {
        console.error("kot details: load failed", err);
        this.error = true;
      } finally {
        this.loading = false;
      }
    },
    onKeydown(e) {
      if (e.key === "Escape" && this.open) this.$emit("close");
    },
  },
  watch: {
    open(isOpen) {
      if (isOpen) {
        this.details = null;
        this.load();
      }
    },
  },
  mounted() {
    document.addEventListener("keydown", this.onKeydown);
  },
  beforeUnmount() {
    document.removeEventListener("keydown", this.onKeydown);
  },
};
</script>

<style scoped>
.section-heading {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #9a7e6b;
  margin-bottom: 0.5rem;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0;
  border: 1px solid #eadfce;
  border-radius: 0.75rem;
  overflow: hidden;
  background: #fff;
}

.detail-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.625rem 1rem;
}

.detail-row + .detail-row {
  border-top: 1px solid #f2e9da;
}

.detail-label {
  font-size: 0.8125rem;
  color: #9a7e6b;
  flex-shrink: 0;
}

.detail-value {
  font-size: 0.9375rem;
  font-weight: 600;
  color: #3f2a20;
  text-align: end;
  min-width: 0;
  word-break: break-word;
}
</style>
