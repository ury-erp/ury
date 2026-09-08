import { describe, expect, it } from 'vitest'
import { validateCartAgainstMenu } from './cart-validation'

const menu = [
  { id: 'SOUP', item: 'SOUP', name: 'Soup', disabled: 0 as const },
  { id: 'OFF', item: 'OFF', name: 'Off Menu Dish', disabled: 1 as const },
]

describe('validateCartAgainstMenu', () => {
  it('passes when all new lines are on-menu and enabled', () => {
    expect(
      validateCartAgainstMenu([{ id: 'SOUP', item: 'SOUP', name: 'Soup' }], menu)
    ).toEqual({ ok: true })
  })

  it('rejects a newly added disabled item by name', () => {
    expect(
      validateCartAgainstMenu([{ id: 'OFF', item: 'OFF', name: 'Off Menu Dish' }], menu)
    ).toEqual({ ok: false, message: 'Off Menu Dish is unavailable' })
  })

  it('rejects a newly added off-menu item', () => {
    expect(
      validateCartAgainstMenu([{ id: 'MISSING', item: 'MISSING', name: 'Ghost' }], menu)
    ).toEqual({ ok: false, message: 'Ghost is not on this menu' })
  })

  it('skips historic invoice lines even if disabled or missing', () => {
    expect(
      validateCartAgainstMenu(
        [
          { id: 'OFF', item: 'OFF', name: 'Off Menu Dish', invoiceItemName: 'row-1' },
          { id: 'GONE', item: 'GONE', name: 'Gone', invoiceItemName: 'row-2' },
        ],
        menu
      )
    ).toEqual({ ok: true })
  })

  it('matches menu identity on item or id (favourites style)', () => {
    expect(
      validateCartAgainstMenu([{ id: 'SOUP', name: 'Soup' }], [{ item: 'SOUP', name: 'Soup', disabled: false }])
    ).toEqual({ ok: true })
    expect(
      validateCartAgainstMenu([{ item: 'SOUP', name: 'Soup' }], [{ id: 'SOUP', name: 'Soup', disabled: 0 }])
    ).toEqual({ ok: true })
  })

  it('treats disabled true / "1" as unavailable', () => {
    expect(
      validateCartAgainstMenu([{ id: 'X', name: 'X' }], [{ id: 'X', item: 'X', name: 'X', disabled: true }])
    ).toEqual({ ok: false, message: 'X is unavailable' })
    expect(
      validateCartAgainstMenu([{ id: 'Y', name: 'Y' }], [{ id: 'Y', item: 'Y', name: 'Y', disabled: '1' as unknown as 1 }])
    ).toEqual({ ok: false, message: 'Y is unavailable' })
  })
})
