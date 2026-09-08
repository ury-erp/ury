export type CartLineForMenuCheck = {
  id?: string
  item?: string
  name?: string
  invoiceItemName?: string
  disabled?: 0 | 1 | boolean
}

export type MenuItemForCheck = {
  id?: string
  item?: string
  name?: string
  item_name?: string
  disabled?: 0 | 1 | boolean
}

export type CartMenuValidationResult =
  | { ok: true }
  | { ok: false; message: string }

function lineCode(line: CartLineForMenuCheck): string {
  return line.item || line.id || ''
}

function lineLabel(line: CartLineForMenuCheck): string {
  return line.name || lineCode(line) || 'Item'
}

function isDisabled(value: unknown): boolean {
  return value === true || value === 1 || value === '1'
}

function findMenuItem(menuItems: MenuItemForCheck[], code: string): MenuItemForCheck | undefined {
  return menuItems.find((m) => m.item === code || m.id === code)
}

/**
 * Reject newly added cart lines that are off-menu or disabled.
 * Lines already on the server invoice (`invoiceItemName`) are kept.
 */
export function validateCartAgainstMenu(
  lines: CartLineForMenuCheck[],
  menuItems: MenuItemForCheck[]
): CartMenuValidationResult {
  for (const line of lines) {
    if (line.invoiceItemName) continue

    const code = lineCode(line)
    const label = lineLabel(line)
    const menuItem = findMenuItem(menuItems, code)

    if (!menuItem) {
      return { ok: false, message: `${label} is not on this menu` }
    }
    if (isDisabled(menuItem.disabled)) {
      return { ok: false, message: `${label} is unavailable` }
    }
  }

  return { ok: true }
}
