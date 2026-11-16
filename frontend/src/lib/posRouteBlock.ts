/**
 * ======================================================================================
 *  /ury/pos/*  IS TEMPORARILY BLOCKED FOR EVERY USER (Administrator and System Manager
 *  included).
 * ======================================================================================
 *
 * Why: the POS tree that lives inside this app (`frontend/src/pages/Pos`, served at
 * `/ury/pos/...`) is a second copy of the standalone POS (`pos/`, served at `/pos`). It is
 * not ready to be used, and it must not be reachable by accident -- for example a cashier
 * who picks the "URY" tile on the Desk apps screen used to be redirected from `/ury` to
 * `/ury/pos/dashboard`. They now get a plain "no access" message instead.
 *
 * What is blocked (keep these in step):
 *   1. Client:  `App.tsx` renders `<NoAccess />` for `/pos/*` and `Landing` renders it for
 *               non-managers, while `URY_POS_ROUTES_ENABLED` is false.
 *   2. Server:  `ury/www/ury.py` (`POS_ROUTE_BLOCKED`) refuses `/ury/pos` and `/ury/pos/*`
 *               with a 403, so typing the URL or reloading it never reaches the app.
 *
 * To re-enable: set `URY_POS_ROUTES_ENABLED = true` here AND `POS_ROUTE_BLOCKED = False` in
 * `ury/www/ury.py`, then rebuild the frontend (`yarn ury-frontend-build`).
 *
 * This does not touch the standalone POS at `/pos`, which keeps working as before.
 */
export const URY_POS_ROUTES_ENABLED = false;
