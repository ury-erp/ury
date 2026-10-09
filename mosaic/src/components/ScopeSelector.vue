<template>
  <div ref="menu" class="relative" @keydown.esc="open = false">
    <button
      type="button"
      :aria-label="`Select Active ${label}`"
      :aria-expanded="open"
      :disabled="disabled"
      class="flex items-center gap-2 h-7 px-2.5 bg-[var(--sunk)] hover:bg-[var(--hover)] rounded-[7px] text-sm font-medium text-[var(--t1)] disabled:opacity-50"
      @click="open = !open"
    >
      <svg class="w-4 h-4 shrink-0 text-[var(--t3)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M9 21v-4h6v4M8 7h2m4 0h2M8 11h2m4 0h2" />
      </svg>
      <span class="max-w-[100px] sm:max-w-[160px] truncate">{{ selectedLabel }}</span>
      <svg class="w-4 h-4 shrink-0 text-[var(--t3)]" :class="{ 'rotate-180': open }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
    <div v-if="open" class="absolute right-0 mt-2 w-64 max-h-80 overflow-auto bg-[var(--panel)] rounded-lg shadow-lg border border-[var(--hair)] py-1.5 z-50">
      <div class="px-3 py-1.5 text-xs font-semibold text-[var(--t3)] uppercase tracking-wider">Select Active {{ label }}</div>
      <button
        v-for="option in allOptions"
        :key="option.value"
        type="button"
        :aria-pressed="modelValue === option.value"
        class="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left"
        :class="modelValue === option.value ? 'bg-[var(--ac-t)] text-[var(--ac)] font-semibold' : 'text-[var(--t1)] hover:bg-[var(--hover)]'"
        @click="select(option.value)"
      >
        <span class="truncate">{{ option.label }}</span>
        <svg v-if="modelValue === option.value" class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";

const props = defineProps({
  modelValue: { type: String, default: "all" },
  label: { type: String, required: true },
  allLabel: { type: String, required: true },
  options: { type: Array, default: () => [] },
  disabled: Boolean,
});
const emit = defineEmits(["update:modelValue"]);
const open = ref(false);
const menu = ref(null);
const allOptions = computed(() => [{ value: "all", label: props.allLabel }, ...props.options]);
const selectedLabel = computed(() => allOptions.value.find((option) => option.value === props.modelValue)?.label || `Select ${props.label}`);

function select(value) {
  emit("update:modelValue", value);
  open.value = false;
}

function closeOutside(event) {
  if (!menu.value?.contains(event.target)) open.value = false;
}

onMounted(() => document.addEventListener("mousedown", closeOutside));
onUnmounted(() => document.removeEventListener("mousedown", closeOutside));
</script>
