<template>
  <button
    type="button"
    class="station-card animate-fade-in-up stagger press"
    :class="{ 'station-card--off': disabled, 'station-card--live': !disabled && waiting > 0 }"
    :disabled="disabled"
    :aria-label="`${$t('production.open')}: ${title}`"
    @click="$emit('open')"
  >
    <!-- Header -->
    <span class="station-card__head">
      <span class="station-card__icon" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 12h20" /><path d="M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8" /><path d="m4 8 16-4" />
          <path d="m8.86 6.78-.45-1.81a2 2 0 0 1 1.45-2.43l1.94-.48a2 2 0 0 1 2.43 1.46l.45 1.8" />
        </svg>
      </span>
      <span class="min-w-0 flex-1 text-start">
        <span class="station-card__name">{{ title }}</span>
        <span class="station-card__status">
          <span class="station-card__dot" aria-hidden="true"></span>
          {{ disabled ? $t('production.disabled') : waiting > 0 ? $t('production.live') : $t('production.quiet') }}
        </span>
      </span>
    </span>

    <!-- Numbers -->
    <span class="station-card__stats">
      <span class="station-stat station-stat--waiting">
        <span class="station-stat__value">{{ waiting }}</span>
        <span class="station-stat__label">{{ $t('production.waiting') }}</span>
      </span>
      <span class="station-stat station-stat--served">
        <span class="station-stat__value">{{ served }}</span>
        <span class="station-stat__label">{{ $t('production.served_today') }}</span>
      </span>
      <span class="station-stat">
        <span class="station-stat__value">{{ orders }}</span>
        <span class="station-stat__label">{{ $t('production.orders_today') }}</span>
      </span>
    </span>

    <!-- Footer -->
    <span class="station-card__foot">
      <template v-if="disabled">{{ $t('production.disabled_hint') }}</template>
      <template v-else>
        <span>{{ $t('production.open') }}</span>
        <svg class="station-card__arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M5 12h14m-6-6 6 6-6 6" />
        </svg>
      </template>
    </span>
  </button>
</template>

<script>
export default {
  name: "ProductionCard",

  emits: ["open"],

  props: {
    title: { type: String, required: true },
    waiting: { type: Number, default: 0 },
    served: { type: Number, default: 0 },
    orders: { type: Number, default: 0 },
    disabled: { type: Boolean, default: false },
  },
};
</script>
