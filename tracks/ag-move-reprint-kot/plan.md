# Move KOT Reprint Option to Order Log

**Owner:** antigravity
**Status:** Completed
**Branch:** kot-reprint-by-production-unit
**Goal:** Move the KOT reprint option to the order log under the option menu on the right side bar, with no icon, just "Reprint KOT" as the option label.

## Context
Previously, a KOT reprint button was added in the order cart of the React POS UI next to the comment button (track: `sa-kot-reprint`). The new requirement is to move this option to the order log's option menu on the right sidebar (as shown in the provided image).

## Spec
- Locate the React POS UI component handling the Order Log and its right sidebar option menu (which currently contains "Merge bill", "Split bill", etc.).
- Add a new menu item labeled "Reprint KOT" without any icon.
- Remove the existing KOT reprint button from the order cart (next to the comment button).
- Ensure the new "Reprint KOT" menu item triggers the exact same logic as the previous button.

## Todos
- [x] Find the order log component and its context menu in the React POS UI.
- [x] Find the old KOT reprint button in the order cart and remove it.
- [x] Add the "Reprint KOT" menu item to the order log context menu.
- [x] Bind the existing KOT reprint functionality to the new menu item.
- [x] Test the UI changes locally to verify functionality and aesthetics.
