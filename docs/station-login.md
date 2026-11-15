# Station sign-in (shared POS screens)

For restaurants where several waiters share a few POS screens. A waiter walks
up to any screen, types their own PIN, and is signed in to the POS as
themselves. Tapping **Done**, or walking away, returns the screen to the PIN
page for the next waiter.

Each waiter is a normal user with the `URY Captain` role; the PIN is only a
faster way to start their session. Orders are therefore attributed to the
waiter exactly as with a normal login.

The feature is off until a manager creates a station. Normal logins are not
affected.

## Set up (manager, once)

1. **Stations:** Desk > *URY Station* > New. Give each shared screen a code,
   for example `POS1`. The code identifies the screen, not a person.
2. **Screens:** open the station and click **Activate a Screen**. A 6-digit
   code appears. On the screen itself open `/station`, enter the station code
   and the 6-digit code. The screen now remembers its station.
3. **Waiters:** Desk > *URY Waiter PIN* > **New Waiter**. Enter a name and a
   PIN. This creates the user (no email is sent and no password is set), gives
   them the `URY Captain` role, and adds them to the Branch and the POS Profile
   as the last row, so existing rows keep their order.
4. **Settings:** Desk > *URY Station Settings* for PIN length (4 to 6 digits),
   idle sign-out (default 90 seconds), lockout, and which roles a PIN user may
   hold.

To change a waiter's PIN or switch them off, open their *URY Waiter PIN*
record. Every sign-in attempt is recorded in *URY Station Sign-in Log*.

## Daily use

- The cashier opens the POS as usual. Waiters cannot sign in until today's POS
  session is open.
- Waiter: type PIN > **Sign in** > take orders > **Done**.
- Managers and cashiers use **Staff login** at the bottom of the PIN page.

## Test script (on a tablet)

Before you start: the POS is open for today, one station and one waiter exist,
and you have an activation code for the station.

| # | Do this | Expect |
|---|---------|--------|
| 1 | Open `https://<your-site>/station` | "Set up this screen" |
| 2 | Enter the station code and the activation code, **Save** | "Enter your PIN"; the footer shows the station |
| 3 | Type a wrong PIN, **Sign in** | "Wrong PIN. 4 tries left." |
| 4 | Type the waiter's PIN, **Sign in** | Table list opens; the waiter's name and a green **Done** button at the top |
| 5 | Open a table, add an item, **Send Order** | Order is sent |
| 6 | In Desk, open that POS Invoice | *Waiter* is the waiter |
| 7 | Tap **Done** | Back at "Enter your PIN" |
| 8 | Press the browser's Back button | The POS does not reopen |
| 9 | Sign in, then leave the screen alone | After 75 s "Still there?" appears; 15 s later it signs out |
| 10 | Sign in, wait for "Still there?", touch the screen | Stays signed in |
| 11 | Type a wrong PIN 5 times | The station locks for 5 minutes with a countdown |
| 12 | In Desk, open the station > **Unlock Now** | The PIN works again |
| 13 | On a phone that was never activated, open `/station` and enter the station code with no activation code | Refused |
| 14 | Give a manager a *URY Waiter PIN* and try it | "Manager and admin accounts cannot sign in with a PIN." |
| 15 | Tap **Staff login** | Normal login page |
| 16 | Close and reopen the browser, open `/station` | Goes straight to "Enter your PIN" |

## Security

- A PIN is never stored, logged or returned. Only a salted hash is kept, and
  PINs are unique among enabled waiters.
- A PIN only opens accounts whose roles are all on the allowed list (default:
  `URY Captain`). System Manager, Accounts Manager, URY Manager, URY Admin and
  Administrator are always refused and cannot be added to the list.
- Sign-in only works from a screen a manager activated, so knowing a station
  code is not enough to try PINs from another device.
- 5 wrong PINs lock the station for 5 minutes; requests are also rate limited
  per IP address.
- Station sessions are kept out of the Desk (setting, on by default).
- With 4 digits there are only 10,000 PINs. Prefer 5 or 6 digits when there
  are many waiters, and serve the site over HTTPS.

## For developers

| Part | Where |
|------|-------|
| Sign-in and screen activation endpoints | `ury/ury/station/signin.py` |
| PIN rules, who may sign in, lockout | `ury/ury/station/pin.py`, `eligibility.py`, `lockout.py` |
| Station marker on the session, POS boot info, Desk redirect | `ury/ury/station/session.py` |
| Creating a waiter | `ury/ury/station/waiter.py` |
| PIN page | `ury/www/station.html`, `ury/public/js/ury_station.js` |
| Done button and idle sign-out in the POS | `pos/src/components/StationSession.tsx` |
| Order-takers passing the POS opening gate | `check_opening_entry` in `ury/ury_pos/api.py` |

Tests: `ury.ury.station.test_station_signin` runs on any site with URY.
`ury.ury.station.test_order_attribution` needs a working restaurant with
today's POS session open; it writes a real order and removes it, so run it on a
test site only.
