# Worklog

## Mosaic KDS — Critical Issue Fixes

**Date:** 2025-01-XX
**Files modified:**
- `URYMosaic/src/components/kot.vue`
- `URYMosaic/src/style.css`
- `URYMosaic/src/components/Header.vue`

### Summary
Fixed 13 issues (3 CRITICAL, 10 HIGH) in the Mosaic Kitchen Display System. The fixes address memory leaks, unhandled errors, redundant socket work, mutation of computed arrays, missing user feedback, and Vite boilerplate CSS limiting the KDS display.

### Fix Details

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 1 | CRITICAL | Socket channel listener never removed on unmount, causing duplicate listeners on remount | Stored handler as `this.socketHandler` in data(); added `socket.off(this.kot_channel, this.socketHandler)` in `beforeUnmount()` |
| 2 | CRITICAL | Masonry instance created without destroying previous, causing layout corruption | Added `if (this.masonry) { this.masonry.destroy(); this.masonry = null; }` at start of `masonryLoading()` |
| 3 | CRITICAL | Window resize handler fires on every pixel, causing severe jank | Added `debounce()` utility; resize listener now uses 150ms debounced wrapper stored as `this._resizeHandler`; properly removed in `beforeUnmount()` |
| 4 | HIGH | Socket setTimeout (1500ms cancelled-KOT check) not cleared on unmount | Stored timeout as `this._cancelTimeout`; added `clearTimeout` in `beforeUnmount()` |
| 5 | HIGH | No disconnect handler on socket — silent failures | Added `socket.on('disconnect', ...)` in `mounted()` with user-facing status message |
| 6 | HIGH | `connect_error` handler only logged, no user feedback | Moved handler from module-level `initializeSocket()` to `mounted()` where `this` is available; sets `this.statusMessage = "Connection error. Retrying..."` |
| 7 | HIGH | `audio.play()` promise not caught (autoplay policy rejection) | Changed to `audio.play().catch(() => {})` |
| 8 | HIGH | `JSON.parse()` on localStorage value without try/catch | Wrapped in try/catch, defaults `striked` to `false` on parse error |
| 9 | HIGH | `targetTime.split(":")` throws on null/undefined | Added guard: `if (!targetTime || !targetTime.includes(":")) return '— : —'` |
| 10 | HIGH | Vite boilerplate `#app { max-width: 1280px; ... }` limits KDS on 1920px+ screens | Replaced with `#app { width: 100%; min-height: 100vh; }` |
| 11 | HIGH | `sortedKotItems` computed mutates original `kot_items` array via `.sort()` | Changed to `[...kot.kot_items].sort(...)` using spread to create a copy |
| 12 | HIGH | Socket handler does redundant `unshift` + `masonryLoading` when full refresh is already needed | Restructured to if/else: full refresh path skips intermediate mutations; incremental path adds reactive properties (`isRotated`, `showDiv`, `timecolor`, `timeRemaining`) |
| 13 | HIGH | Dead code removal | Removed: `// inject: []`, `const self = this` (replaced usage with `this`), empty `<div></div>` in template, empty `socket.on('connect', () => {})`, empty `setup() {}` and `computed: {}` in Header.vue, commented-out imports in Header.vue |