<template>
  <div>
    <!--
      Blocking layer — a message the line must not miss (allergy, recall, VIP).
      It covers the board because a banner on a busy kitchen screen gets
      scrolled past; the only way back to the orders is to confirm you read it.
    -->
    <div
      v-if="blocking"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-[#241914]/85 backdrop-blur-sm p-6 animate-fade-in"
      role="alertdialog"
      aria-modal="true"
      :aria-label="$t('messages.blocking_title')"
    >
      <div class="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl animate-scale-in">
        <div :class="['flex items-center gap-3 px-7 py-4', bannerClass(blocking.priority)]">
          <span class="flex h-3 w-3 shrink-0 rounded-full bg-white/90 animate-pulse-soft" aria-hidden="true"></span>
          <span class="text-sm font-bold uppercase tracking-wider text-white">
            {{ priorityLabel(blocking.priority) }} · {{ $t('messages.must_read') }}
          </span>
          <span v-if="blockingQueue.length > 1" class="ms-auto text-xs font-semibold text-white/85">
            {{ $t('messages.queue_position', { index: 1, total: blockingQueue.length }) }}
          </span>
        </div>

        <div class="px-7 py-8">
          <p class="text-2xl font-bold leading-relaxed text-[#3f2a20]">{{ blocking.message }}</p>

          <div class="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#9a7e6b]">
            <span v-if="blocking.sent_by_name">{{ $t('messages.from', { name: blocking.sent_by_name }) }}</span>
            <span class="bidi-isolate">{{ formatTime(blocking.sent_at) }}</span>
            <span v-if="blocking.production">· {{ blocking.production }}</span>
          </div>

          <p class="mt-6 text-sm text-[#9a7e6b]">{{ $t('messages.blocking_hint') }}</p>
        </div>

        <div class="border-t border-[#eadfce] bg-[#fffdf8] px-7 py-5">
          <button
            @click="acknowledge(blocking)"
            :disabled="busy === blocking.name"
            class="press w-full rounded-xl bg-[#f05b42] px-6 py-4 text-lg font-bold text-white shadow-lg transition-colors duration-fast hover:bg-[#d94c38] disabled:opacity-60"
          >
            {{ busy === blocking.name ? $t('messages.acknowledging') : $t('messages.acknowledge') }}
          </button>
        </div>
      </div>
    </div>

    <!--
      Informational rail — visible but never in the way. Stays until it expires
      or a cook dismisses it.
    -->
    <div v-if="informational.length" class="mb-5 space-y-2">
      <div
        v-for="(msg, index) in informational"
        :key="msg.name"
        :style="{ '--i': index }"
        class="animate-slide-in stagger-fast flex items-start gap-3 rounded-xl border bg-white px-4 py-3 shadow-sm"
        :class="railClass(msg.priority)"
        role="status"
      >
        <span
          class="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
          :class="dotClass(msg.priority)"
          aria-hidden="true"
        ></span>

        <div class="min-w-0 flex-1">
          <p class="text-base font-semibold leading-snug text-[#3f2a20]">{{ msg.message }}</p>
          <p class="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-[#9a7e6b]">
            <span class="font-medium">{{ priorityLabel(msg.priority) }}</span>
            <span>· {{ $t('messages.informational') }}</span>
            <span v-if="msg.sent_by_name">· {{ $t('messages.from', { name: msg.sent_by_name }) }}</span>
            <span class="bidi-isolate">· {{ formatTime(msg.sent_at) }}</span>
          </p>
        </div>

        <button
          @click="dismiss(msg)"
          :disabled="busy === msg.name"
          class="press shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-[#9a7e6b] transition-colors duration-fast hover:bg-[#f7f1e6] hover:text-[#3f2a20] disabled:opacity-50"
          :aria-label="$t('messages.dismiss')"
        >
          &#10005;
        </button>
      </div>
    </div>
  </div>
</template>

<script>
/**
 * Kitchen message layer.
 *
 * Subscribes to one per-branch realtime channel and sorts what arrives into
 * two lanes:
 *
 *   requires_acknowledgement -> blocking overlay, cleared only by confirming
 *   everything else          -> informational rail, dismissible
 *
 * The socket is passed in rather than created here so the display keeps a
 * single connection; if it is not ready yet the component still works from
 * the initial fetch and picks up the subscription once it appears.
 */
export default {
  name: "KitchenMessages",
  props: {
    branch: { type: String, required: true },
    production: { type: String, default: null },
    socket: { type: Object, default: null },
  },
  data() {
    return {
      messages: [],
      busy: null,
      channel: null,
      pollTimer: null,
    };
  },
  computed: {
    /** Messages addressed to this station, or to the whole branch. */
    mine() {
      return this.messages.filter(
        (m) => !m.production || m.production === this.production
      );
    },
    blockingQueue() {
      return this.mine
        .filter((m) => m.requires_acknowledgement && m.status === "Active")
        .sort((a, b) => this.weight(b.priority) - this.weight(a.priority));
    },
    /** Only ever one on screen: two stacked modals cannot both be read. */
    blocking() {
      return this.blockingQueue[0] || null;
    },
    informational() {
      return this.mine
        .filter((m) => !m.requires_acknowledgement && m.status === "Active")
        .sort((a, b) => this.weight(b.priority) - this.weight(a.priority));
    },
  },
  methods: {
    weight(priority) {
      return { Urgent: 3, High: 2, Normal: 1 }[priority] || 0;
    },
    priorityLabel(priority) {
      return this.$t(`messages.priority.${priority || "Normal"}`);
    },
    bannerClass(priority) {
      return {
        Urgent: "bg-[#c0392b]",
        High: "bg-[#e07b18]",
        Normal: "bg-[#3f2a20]",
      }[priority] || "bg-[#3f2a20]";
    },
    railClass(priority) {
      return {
        Urgent: "border-red-300 bg-red-50",
        High: "border-amber-300 bg-amber-50",
        Normal: "border-[#eadfce]",
      }[priority] || "border-[#eadfce]";
    },
    dotClass(priority) {
      return {
        Urgent: "bg-red-500 animate-pulse-soft",
        High: "bg-amber-500",
        Normal: "bg-[#9a7e6b]",
      }[priority] || "bg-[#9a7e6b]";
    },
    formatTime(value) {
      if (!value) return "";
      const d = new Date(value.replace(" ", "T"));
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    },

    async call(method, body) {
      const res = await fetch(`/api/method/${method}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Frappe-CSRF-Token": window.csrf_token || "",
        },
        credentials: "include",
        body: JSON.stringify(body || {}),
      });
      if (!res.ok) throw new Error(`${method} failed: ${res.status}`);
      return (await res.json()).message;
    },

    async fetchMessages() {
      try {
        const rows = await this.call(
          "ury.ury.api.ury_kitchen_message.get_active_messages",
          { branch: this.branch, production: this.production }
        );
        this.messages = Array.isArray(rows) ? rows : [];
      } catch (err) {
        console.error("kitchen messages: fetch failed", err);
      }
    },

    async acknowledge(msg) {
      if (this.busy) return;
      this.busy = msg.name;
      try {
        await this.call("ury.ury.api.ury_kitchen_message.acknowledge", {
          name: msg.name,
          station: this.production,
        });
        this.remove(msg.name);
      } catch (err) {
        console.error("kitchen messages: acknowledge failed", err);
        // Left on screen on purpose — a message that was never confirmed must
        // not silently disappear just because the network blipped.
      } finally {
        this.busy = null;
      }
    },

    async dismiss(msg) {
      if (this.busy) return;
      this.busy = msg.name;
      try {
        await this.call("ury.ury.api.ury_kitchen_message.dismiss", { name: msg.name });
        this.remove(msg.name);
      } catch (err) {
        console.error("kitchen messages: dismiss failed", err);
      } finally {
        this.busy = null;
      }
    },

    remove(name) {
      this.messages = this.messages.filter((m) => m.name !== name);
    },

    onRealtime(payload) {
      const msg = payload && payload.message;
      if (!msg) return;

      if (payload.event === "new") {
        // Replace rather than append: a reconnect can redeliver.
        this.remove(msg.name);
        this.messages.unshift(msg);
      } else {
        // acknowledged / dismissed elsewhere — another station got to it first.
        this.remove(msg.name);
      }
    },

    subscribe() {
      if (!this.socket || this.channel) return;
      this.channel = `ury_kitchen_message_${this.branch}`;
      this.socket.on(this.channel, this.onRealtime);
      // A reconnect can miss events, so re-sync whenever the socket comes back.
      this.socket.on("connect", this.fetchMessages);
    },
  },

  watch: {
    socket: {
      immediate: true,
      handler() {
        this.subscribe();
      },
    },
  },

  mounted() {
    this.fetchMessages();
    this.subscribe();
    // Safety net: expiry is evaluated server-side on fetch, and this also
    // covers a socket that dropped without firing `connect`.
    this.pollTimer = setInterval(this.fetchMessages, 60000);
  },

  beforeUnmount() {
    clearInterval(this.pollTimer);
    if (this.socket && this.channel) {
      this.socket.off(this.channel, this.onRealtime);
      this.socket.off("connect", this.fetchMessages);
    }
  },
};
</script>
