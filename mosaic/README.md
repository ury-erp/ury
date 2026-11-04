# Vue 3 + Vite

This template should help get you started developing with Vue 3 in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur) + [TypeScript Vue Plugin (Volar)](https://marketplace.visualstudio.com/items?itemName=Vue.vscode-typescript-vue-plugin).

## Languages (i18n / RTL)

Mosaic ships a tiny i18n layer in `src/i18n.js`. The language comes from `window.frappe.boot.lang`, then the server-rendered `<html lang>` (set from `frappe.lang` in `index.html`), then `en`. RTL languages (`ar`, `he`, `fa`, `ur`, `ku`) set `dir="rtl"` on `<html>`.

English strings are their own keys, so `src/locales/en.json` stays `{}` and the English UI is unchanged. Templates use `{{ __("Text") }}` and scripts use `t("Text {0}", value)`; positional `{0}`, `{1}` placeholders are substituted.

To add a language (for example `fr`):

1. Create `src/locales/fr.json` mapping each English string to its translation. Keep placeholders such as `{0}` intact. Copy `ar.json` as a key list.
2. Import it in `src/i18n.js` and add it to `catalogs`. If the language is right-to-left, add its code to `RTL`.
3. If the language needs a specific font, add the `@font-face` and a `html[lang='fr'] { --s: ... }` rule in `src/index.css` (see Almarai for `ar`). Almarai (`src/assets/fonts/`) is licensed under the SIL Open Font License 1.1; the licence and copyright notice are in `src/assets/fonts/OFL.txt` and must stay next to the font files. Bundle any new font with its licence the same way.
4. Use logical Tailwind utilities (`ms-*`, `me-*`, `start-*`, `end-*`, `text-start`) instead of `ml/mr/left/right` for new UI, and wrap numbers, timers and quantities in `dir="ltr"`.
5. Run `yarn test`; `src/i18n.spec.js` checks that placeholders match between English keys and translations.
