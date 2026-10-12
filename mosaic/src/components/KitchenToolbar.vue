<template>
  <div class="kds-toolbar mb-5 rounded-2xl border border-[#eadfce] bg-[#fffdf8] px-4 py-3 shadow-[0_4px_16px_rgba(74,48,30,0.06)]">
    <!-- Row 1: what this station is, how it is doing, and whether it is live -->
    <div class="flex flex-wrap items-center gap-x-4 gap-y-3">
      <div class="min-w-0">
        <h2 class="truncate text-lg font-bold leading-tight text-[#3f2a20]">{{ production }}</h2>
        <p class="text-[11px] font-semibold uppercase tracking-wider text-[#9a7e6b]">
          {{ $t('kot.station') }} · {{ clock }}
        </p>
      </div>

      <!-- Shift numbers. Each one is a number a kitchen actually acts on:
           how much is open, how much is already being cooked, how much is
           past the promise time, and how the shift is tracking overall. -->
      <div class="flex flex-wrap items-center gap-2">
        <span class="kds-stat">
          <b class="tabular-nums">{{ counts.all }}</b>{{ $t('toolbar.open') }}
        </span>
        <span class="kds-stat kds-stat--prep" v-if="counts.preparing">
          <b class="tabular-nums">{{ counts.preparing }}</b>{{ $t('toolbar.preparing') }}
        </span>
        <span class="kds-stat kds-stat--late" v-if="counts.late">
          <b class="tabular-nums">{{ counts.late }}</b>{{ $t('toolbar.late') }}
        </span>
        <span class="kds-stat kds-stat--done">
          <b class="tabular-nums">{{ stats.served_today || 0 }}</b>{{ $t('toolbar.served_today') }}
        </span>
        <span class="kds-stat" v-if="stats.avg_minutes">
          <b class="tabular-nums bidi-isolate">{{ stats.avg_minutes }}</b>{{ $t('toolbar.avg_minutes') }}
        </span>
      </div>

      <div class="ms-auto flex items-center gap-2">
        <span
          class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
          :class="connected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'"
          role="status"
        >
          <span
            class="h-2 w-2 rounded-full"
            :class="connected ? 'bg-emerald-500 animate-pulse-soft' : 'bg-amber-500'"
            aria-hidden="true"
          ></span>
          {{ connected ? $t('kot.live') : $t('kot.reconnecting') }}
        </span>
      </div>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-[#f0e7d8] pt-3">
      <!-- Filters. Segmented rather than a dropdown: on a touch screen above a
           hot line, every extra tap is a tap somebody will not make. -->
      <div class="kds-segment" role="group" :aria-label="$t('toolbar.filter')">
        <button
          v-for="option in filterOptions"
          :key="option.value"
          type="button"
          class="kds-segment__item press"
          :class="{ 'kds-segment__item--on': filter === option.value }"
          :aria-pressed="filter === option.value"
          @click="$emit('update:filter', option.value)"
        >
          {{ option.label }}
          <span class="kds-segment__count tabular-nums">{{ counts[option.value] }}</span>
        </button>
      </div>

      <!-- Oldest-first is the default because a kitchen works a queue, not a
           stack; newest-first exists only for glancing at what just landed. -->
      <button
        type="button"
        class="kds-chip press"
        @click="$emit('update:sort', sort === 'oldest' ? 'newest' : 'oldest')"
        :title="$t('toolbar.sort_hint')"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 6h13M3 12h9M3 18h5" />
          <path :d="sort === 'oldest' ? 'M18 9l3 3-3 3' : 'M21 9l-3 3 3 3'" />
        </svg>
        {{ sort === 'oldest' ? $t('toolbar.sort_oldest') : $t('toolbar.sort_newest') }}
      </button>

      <div class="ms-auto flex items-center gap-2">
        <button
          type="button"
          class="kds-chip press"
          :class="{ 'kds-chip--warn': recallCount > 0 }"
          @click="$emit('open-recall')"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" />
          </svg>
          {{ $t('toolbar.recall') }}
        </button>

        <!-- Sound. Mute is one tap; volume is behind the popover because it is
             set once per kitchen and never again. -->
        <div class="relative" ref="soundMenu">
          <button
            type="button"
            class="kds-chip press"
            :class="{ 'kds-chip--danger': sound.muted || sound.blocked }"
            @click="showSound = !showSound"
            :title="$t('toolbar.sound')"
          >
            <svg v-if="!sound.muted" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" />
            </svg>
            <svg v-else class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="m23 9-6 6" /><path d="m17 9 6 6" />
            </svg>
            <span class="hidden sm:inline">
              {{ sound.muted ? $t('toolbar.muted') : Math.round(sound.volume * 100) + '%' }}
            </span>
          </button>

          <div
            v-if="showSound"
            class="kds-popover animate-scale-in"
          >
            <p class="mb-2 text-xs font-bold uppercase tracking-wider text-[#9a7e6b]">
              {{ $t('toolbar.sound') }}
            </p>

            <button type="button" class="kds-popover__row press" @click="$emit('toggle-mute')">
              <span>{{ sound.muted ? $t('toolbar.unmute') : $t('toolbar.mute') }}</span>
              <span class="text-xs font-bold" :class="sound.muted ? 'text-red-600' : 'text-emerald-600'">
                {{ sound.muted ? $t('toolbar.off') : $t('toolbar.on') }}
              </span>
            </button>

            <label class="mt-3 block">
              <span class="text-xs font-semibold text-[#735d4e]">{{ $t('toolbar.volume') }}</span>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                class="mt-1 w-full accent-[#f05b42]"
                :value="Math.round(sound.volume * 100)"
                @input="$emit('set-volume', $event.target.value / 100)"
              />
            </label>

            <button type="button" class="kds-popover__row press mt-2" @click="$emit('test-sound')">
              <span>{{ $t('toolbar.test_sound') }}</span>
              <span aria-hidden="true">▶</span>
            </button>
          </div>
        </div>

        <button
          v-if="fullscreenSupported"
          type="button"
          class="kds-chip press"
          @click="$emit('toggle-fullscreen')"
          :title="$t('toolbar.fullscreen')"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path v-if="!fullscreen" d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3" />
            <path v-else d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3m8 0v-3a2 2 0 0 1 2-2h3" />
          </svg>
        </button>
      </div>
    </div>

    <!--
      Audio is blocked until the page is touched. The old build showed this as
      loose red text floating over the board with no way to act on it; making
      it a button means one tap both fixes the problem and proves it is fixed.
    -->
    <button
      v-if="sound.blocked && !sound.muted"
      type="button"
      class="press mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#fff0ec] px-4 py-2.5 text-sm font-bold text-[#c83d2d] hover:bg-[#ffe4dd]"
      @click="$emit('enable-audio')"
    >
      <span aria-hidden="true">🔔</span>
      {{ $t('kot.audio_disabled') }}
    </button>
  </div>
</template>

<script>
import { fullscreenSupported } from "../utils/screen";

export default {
  name: "KitchenToolbar",
  props: {
    production: { type: String, default: "" },
    counts: { type: Object, required: true },
    stats: { type: Object, default: () => ({}) },
    sound: { type: Object, required: true },
    filter: { type: String, default: "all" },
    sort: { type: String, default: "oldest" },
    connected: { type: Boolean, default: false },
    fullscreen: { type: Boolean, default: false },
    recallCount: { type: Number, default: 0 },
  },
  emits: [
    "update:filter",
    "update:sort",
    "toggle-mute",
    "set-volume",
    "test-sound",
    "enable-audio",
    "toggle-fullscreen",
    "open-recall",
  ],
  data() {
    return {
      showSound: false,
      fullscreenSupported,
      clock: "",
      clockTimer: null,
    };
  },
  computed: {
    filterOptions() {
      return [
        { value: "all", label: this.$t("toolbar.all") },
        { value: "new", label: this.$t("toolbar.new") },
        { value: "preparing", label: this.$t("toolbar.preparing") },
        { value: "late", label: this.$t("toolbar.late") },
      ];
    },
  },
  methods: {
    tickClock() {
      // Locale-aware so an Arabic board reads Arabic numerals if the browser
      // locale asks for them, rather than a hand-built string.
      this.clock = new Date().toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });
    },
    closeSound(event) {
      if (this.$refs.soundMenu && !this.$refs.soundMenu.contains(event.target)) {
        this.showSound = false;
      }
    },
  },
  mounted() {
    this.tickClock();
    this.clockTimer = setInterval(this.tickClock, 20000);
    document.addEventListener("mousedown", this.closeSound);
  },
  unmounted() {
    clearInterval(this.clockTimer);
    document.removeEventListener("mousedown", this.closeSound);
  },
};
</script>
