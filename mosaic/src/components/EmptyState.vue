<template>
  <!--
    One look for every "nothing to show" moment on the kitchen screens: an
    illustration from the shared Smart Restro set, a title, a line of advice
    and, optionally, the action that gets the cook moving again.
  -->
  <section
    class="empty-state animate-fade-in"
    :class="{ 'empty-state--compact': compact }"
    :role="role"
  >
    <img
      v-if="image && !compact"
      class="empty-state__art"
      :src="`/assets/ury/illustrations/${image}.svg`"
      alt=""
      width="420"
      height="300"
      decoding="async"
    />
    <h2 class="empty-state__title">{{ title }}</h2>
    <p v-if="body" class="empty-state__body">{{ body }}</p>
    <div v-if="$slots.default" class="empty-state__actions">
      <slot />
    </div>
  </section>
</template>

<script>
export default {
  name: "EmptyState",
  props: {
    image: { type: String, default: "" },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    compact: { type: Boolean, default: false },
    role: { type: String, default: "status" },
  },
};
</script>
