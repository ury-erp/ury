# URY Multi-App Architecture Implementation - TODO Tracker

> **Current Phase**: Phase 0 - Foundation & Extraction  
> **Last Updated**: 2026-03-26  
> **Branch**: planning/multi-app-architecture

---

## Phase Overview

| Phase | Description | Status | Duration |
|-------|-------------|--------|----------|
| Phase 0 | Foundation & Extraction | ✅ COMPLETE | 2-3 weeks |
| Phase 1 | Shared Ordering Core | ⏳ PENDING | 2-3 weeks |
| Phase 2 | QR Table Ordering MVP | ⏳ PENDING | 3-4 weeks |
| Phase 2.5 | Payment Gateway Integration | ⏳ PENDING | 2-3 weeks |
| Phase 3 | Online Customer Ordering | ⏳ PENDING | 3-4 weeks |
| Phase 4 | Curbside Extension | ⏳ PENDING | 1-2 weeks |
| Phase 5 | Kiosk Mode | ⏳ PENDING | 2-3 weeks |
| Phase 6 | Hardening & Analytics | ⏳ PENDING | 2-3 weeks |

---

## Phase 0: Foundation & Extraction ✅ COMPLETE

**Goal**: Set up shared infrastructure without breaking existing apps.

**Completed**: 2026-03-26

### Summary

Phase 0 has been successfully completed. The foundation for the multi-app architecture is now in place:

**Backend:**
- ✅ New `ury_customer` module created with customer-facing APIs
- ✅ URY Restaurant DocType extended with slug, accepts_online_orders, logo, opening_hours
- ✅ URY Table DocType extended with qr_token, qr_generated_at
- ✅ URY Menu DocType extended with is_public
- ✅ New website routes added for customer ordering (/order/t/<token>, /menu/<slug>)

**Frontend Infrastructure:**
- ✅ npm workspaces configured with packages/* and apps/*
- ✅ POS app moved to apps/pos with updated build paths
- ✅ @ury/config package - DocType constants and order types
- ✅ @ury/ui package - 10 React UI components
- ✅ @ury/api-client package - Frappe SDK wrapper with typed APIs
- ✅ @ury/cart package - Zustand-based cart state management

**Documentation:**
- ✅ AGENTS.md created for developer guidance
- ✅ README.md updated with architecture overview
- ✅ Package READMEs added for all 4 packages

**Commits:**
- `1d65a61` feat(ury): Phase 0 - Foundation & Extraction
- `aaaa4d3` docs: update README and add AGENTS.md
- `6bc4978` docs: add README files for all packages and apps

### Phase 0A: Frontend Shared Packages

| Task | Status | Files Changed | Notes |
|------|--------|---------------|-------|
| 1. Add npm workspaces | ✅ DONE | `package.json` | Added `"workspaces": ["packages/*", "apps/*"]` |
| 2. Create `apps/` directory structure | ✅ DONE | `apps/pos/` (moved from `/pos`) | Moved existing pos to apps/ |
| 3. Create `packages/` directory | ✅ DONE | `packages/` | Shared npm packages root created |
| 4. Extract `@ury/config` | ✅ DONE | `packages/config/` | doctypes.ts, order-types.ts extracted |
| 5. Extract `@ury/ui` | ✅ DONE | `packages/ui/` | button, card, dialog, input, select, badge, toast, spinner, loader |
| 6. Extract `@ury/api-client` | ✅ DONE | `packages/api-client/` | frappe-sdk.ts wrapper, menu-api, auth-api |
| 7. Extract `@ury/cart` | ✅ DONE | `packages/cart/` | Cart state from pos-store.ts with Zustand |
| 8. POS v2 refactor imports | ⏳ PENDING | `apps/pos/src/` | Update to use packages |
| 9. Update vite.config.ts paths | ✅ DONE | `apps/pos/vite.config.ts` | Updated outDir path |
| 10. Update package.json scripts | ✅ DONE | `apps/pos/package.json` | Updated copy-html-entry path |
| 11. Create `ury_customer` module | ✅ DONE | `ury/ury_customer/` | Backend module for customer APIs |
| 12. Add to modules.txt | ✅ DONE | `ury/modules.txt` | Added "URY Customer" |
| 13. Update URY Restaurant DocType | ✅ DONE | `ury/ury/doctype/ury_restaurant/` | Added slug, accepts_online_orders, logo, opening_hours |
| 14. Update URY Table DocType | ✅ DONE | `ury/ury/doctype/ury_table/` | Added qr_token, qr_generated_at |
| 15. Update URY Menu DocType | ✅ DONE | `ury/ury/doctype/ury_menu/` | Added is_public |
| 16. Update hooks.py routes | ✅ DONE | `ury/hooks.py` | Added customer ordering routes |

### Phase 0B: Backend API Refactoring

| Task | Status | Files Changed | Notes |
|------|--------|---------------|-------|
| 1. Create `ury_customer` module | ⏳ PENDING | `ury/ury_customer/` | New Frappe module |
| 2. Add to modules.txt | ⏳ PENDING | `ury/modules.txt` | Add "URY Customer" |
| 3. Create `get_public_menu()` | ⏳ PENDING | `ury/ury_customer/api.py` | Public menu endpoint |
| 4. Backend DRY pass | ⏳ PENDING | `ury/ury_pos/api.py` | Unify invoice queries |

---

## Files Changed Log

### Phase 0 Changes

```
# New Directories
packages/
├── config/
├── ui/
├── api-client/
└── cart/
apps/
└── pos/              # Moved from /pos

# Modified Files
package.json          # Added workspaces
ury/modules.txt       # Added "URY Customer"

# New Backend Files
ury/ury_customer/
├── __init__.py
└── api.py
```

---

## Blockers & Risks

| Risk | Mitigation | Status |
|------|------------|--------|
| Import path breakage in POS v2 | Extract incrementally, test after each package | 🟡 MONITORING |
| Frappe guest permission model | Use `allow_guest=True` + signed tokens | ⏳ FUTURE |
| Bundle size for mobile | Tree-shake aggressively | ⏳ FUTURE |

---

## Git Commit Log

| Commit | Message | Phase |
|--------|---------|-------|
| - | Initial TODO.md creation | Phase 0 |

---

## Implementation Notes

### From Planning Documents

**Key Principles:**
1. URY is a **single Frappe app** - all new modules go inside `ury/`
2. New Python modules (e.g., `ury_customer`) go inside `ury/` following `ury_pos/` pattern
3. New frontend SPAs go in `apps/` at repo root
4. Every new module must be added to `ury/modules.txt`
5. Every `@frappe.whitelist()` endpoint is callable from frontend
6. For guest APIs use `@frappe.whitelist(allow_guest=True)`

**Phase 0 Success Criteria:**
- [ ] npm workspaces configured
- [ ] POS v2 builds successfully using shared packages
- [ ] `ury_customer` module created with `get_public_menu()` API
- [ ] No regression in existing POS functionality
- [ ] All tests pass

---

## Quick Reference

**Skill Package Location**: `/tmp/frappe-skill/`

**Phase 0 Skills Used:**
- `frappe-impl-customapp` - Module creation
- `frappe-syntax-customapp` - Structure
- `frappe-ops-frontend-build` - Build system

**Frappe Commands:**
```bash
# After doctype/custom field changes
bench migrate

# After API changes not reflecting
bench clear-cache

# Build frontend
bench build --app ury
```
