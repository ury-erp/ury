<template>
  <header>
    <!--
      Brand bar.

      Deep brown, the same surface the kitchen display uses, so a floor tablet
      and a kitchen screen in the same restaurant read as one product. It is
      the only dark band in the app, which is what makes it findable without
      being looked for.

      It carries three things, in the order a waiter needs them: who this is,
      what they are working on, and who they are signed in as. The old bar
      carried only a logo and an avatar circle — the table being served was
      rendered as a bare 3xl `<h3>` in place of the logo, unlabelled.
    -->
    <nav class="pos-header">
      <div class="pos-header-inner">
        <div class="pos-brand">
          <a href="/urypos/Table" class="pos-brand-mark" aria-label="Smart Restro">
            <img :src="imagePath" alt="" />
          </a>

          <span class="hidden pos-brand-name sm:block">
            Smart <strong>Restro</strong>
          </span>

          <span class="pos-brand-divider hidden sm:block" aria-hidden="true"></span>

          <!-- The table, or the till. Never nothing: an unlabelled bar gives
               a waiter no way to notice they are on the wrong table. -->
          <div class="pos-context">
            <span class="pos-context-label">{{ contextLabel }}</span>
            <span class="pos-context-value">{{ contextValue }}</span>
          </div>
        </div>

        <!-- User menu -->
        <div v-if="!this.tabClick.isLoginPage" class="relative flex-shrink-0">
          <button
            type="button"
            class="pos-header-button press"
            id="user-menu-button"
            :aria-expanded="this.auth.activeDropdown ? 'true' : 'false'"
            aria-haspopup="menu"
            @click="this.auth.toggleDropdown()"
            ref="dropdownButton"
          >
            <span class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-foreground">
              {{ this.auth.sessionUser.charAt(0).toUpperCase() }}
            </span>
            <span class="hidden max-w-[10rem] truncate md:block">
              {{ this.auth.sessionUser }}
            </span>
            <svg class="h-4 w-4 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <div
            v-show="this.auth.activeDropdown"
            class="absolute end-0 mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-popover shadow-raised animate-scale-in"
            role="menu"
          >
            <div class="border-b border-border bg-muted px-4 py-3">
              <p class="truncate text-sm font-bold text-foreground">
                {{ this.auth.getLoginAvatar() }}
              </p>
            </div>

            <div class="py-1">
              <button
                type="button"
                role="menuitem"
                class="flex min-h-[2.75rem] w-full items-center gap-3 px-4 text-start text-sm font-semibold text-foreground transition-colors duration-fast hover:bg-muted"
                @click="reload"
              >
                <svg class="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" />
                </svg>
                {{ $t('common.reload') }}
              </button>

              <button
                type="button"
                role="menuitem"
                class="flex min-h-[2.75rem] w-full items-center gap-3 px-4 text-start text-sm font-semibold text-foreground transition-colors duration-fast hover:bg-muted"
                @click="this.auth.routeToHome()"
              >
                <svg class="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect width="20" height="14" x="2" y="3" rx="2" /><path d="M8 21h8M12 17v4" />
                </svg>
                {{ $t('header.switch_to_desk') }}
              </button>

              <div class="my-1 border-t border-border"></div>

              <button
                type="button"
                role="menuitem"
                class="flex min-h-[2.75rem] w-full items-center gap-3 px-4 text-start text-sm font-semibold text-destructive transition-colors duration-fast hover:bg-destructive/10"
                @click="this.auth.logOut"
              >
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" />
                </svg>
                {{ $t('header.logout') }}
              </button>

              <div class="my-1 border-t border-border"></div>

              <!-- Each option is labelled in its own script, so a cashier who
                   cannot read the current language can still switch away. -->
              <p class="px-4 pb-1 pt-1 pos-label">{{ $t('language.label') }}</p>
              <button
                v-for="(label, code) in $lang.supported"
                :key="code"
                type="button"
                role="menuitem"
                :lang="code"
                class="flex min-h-[2.75rem] w-full items-center justify-between px-4 text-sm font-semibold text-foreground transition-colors duration-fast hover:bg-muted"
                @click="$lang.set(code)"
              >
                <span>{{ label }}</span>
                <span v-if="code === $lang.active()" class="text-primary" aria-hidden="true">&#10003;</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  </header>
</template>

<script>
import { useAuthStore } from "@/stores/Auth.js";
import { posOpening } from "@/stores/posOpening.js";
import { posClosing } from "@/stores/posClosing.js";
// The suite's mark, shared with the kitchen display rather than urypos
// carrying its own separate JPEG wordmark.
import smartLogo from "../../../smart_logo.png";
import { tabFunctions } from "@/stores/bottomTabs.js";
import { useTableStore } from "@/stores/Table.js";

export default {
  name: "Header",
  setup() {
    const auth = useAuthStore();
    const posOpen = posOpening();
    const posClose = posClosing();
    const tabClick = tabFunctions();
    const table = useTableStore();

    return { auth, posOpen, posClose, tabClick, table };
  },
  data() {
    return {
      imagePath: smartLogo,
    };
  },
  computed: {
    /**
     * What this screen is working on.
     *
     * The brand and the context now coexist instead of replacing each other,
     * so the bar never loses its identity and never loses the table either.
     * A cashier is not "on" a table, so they get the till instead.
     */
    contextLabel() {
      if (this.auth.cashier) return this.$t("header.station");
      return this.table.selectedTable
        ? this.$t("tables.title")
        : this.$t("header.station");
    },

    contextValue() {
      if (!this.auth.cashier && this.table.selectedTable) {
        return this.table.selectedTable;
      }
      return this.auth.cashier
        ? this.$t("header.till")
        : this.$t("tables.select_table");
    },
  },
  methods: {
    reload() {
      window.location.reload();
    },
  },
};
</script>
