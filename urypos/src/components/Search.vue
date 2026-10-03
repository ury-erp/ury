<template>
  <!-- Search & Filters -->
  <div
    class="mt-5 flex w-full flex-col justify-between gap-2 md:flex-row lg:mt-2"
  >
    <div
      class="relative w-full"
      :class="{
        'md:w-full': this.menu.selectedOrderType === 'Aggregators',
        'md:w-3/4': this.menu.selectedOrderType === 'Aggregators',
      }"
    >
      <div
        class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"
      >
        <svg
          aria-hidden="true"
          class="h-5 w-5 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          ></path>
        </svg>
      </div>
      <input
        type="search"
        id="default-search"
        class="block w-full rounded-xl border border-input bg-muted px-10 pb-2 pt-2.5 text-sm font-medium text-foreground focus:border-ring focus:ring-ring"
        :placeholder="$t('menu.item_search')"
        v-model="this.menu.searchTerm"
        @input="this.menu.handleSearchInput"
        @click="this.menu.clearSearch"
        autocapitalize="none"
      />
    </div>
    <div
      class="flex gap-2"
      v-if="this.menu.selectedOrderType !== 'Aggregators'"
    >
      <div class="relative w-full">
        <label
          for="first"
          class="absolute z-50 -mt-2 ml-2 bg-card px-2 text-xs"
          >{{ $t('menu.select_course') }}</label
        >
        <select
          class="relative w-full rounded-xl border border-input bg-muted pt-2.5 text-sm"
          id="course"
          v-model="menu.selectedCourse"
          @change="this.menu.displayAll = false"
        >
          <option
            v-for="(course, index) in menu.course"
            :key="index"
            :value="course.name"
          >
            {{ course.name }}
          </option>
        </select>
      </div>
      <button
        class="focus:shadow-outline w-28 rounded-xl bg-primary p-2 font-bold text-primary-foreground hover:brightness-95 focus:outline-blue-500"
        type="button"
        :class="{ 'ring-2 ring-accent brightness-90': this.menu.priority }"
        @click="this.menu.showSpecialItems"
      >
        {{ $t('order.priority') }}
      </button>
      <button
        class="focus:shadow-outline w-28 rounded-xl bg-primary p-2 font-bold text-primary-foreground hover:brightness-95 focus:outline-blue-500"
        type="button"
        :class="{ 'ring-2 ring-accent brightness-90': this.menu.displayAll }"
        @click="this.menu.showAllItems"
      >
        {{ $t('common.all') }}
      </button>
    </div>
  </div>
</template>

<script>
import { useMenuStore } from "@/stores/Menu.js";
export default {
  setup() {
    const menu = useMenuStore();
    return { menu };
  },
};
</script>
