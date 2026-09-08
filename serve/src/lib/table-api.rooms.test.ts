import { describe, expect, it } from 'vitest'
import { resolveAllowedRooms, type Room } from './table-api'

const branchRooms: Room[] = [
  { name: 'Hall A', branch: 'Main' },
  { name: 'Hall B', branch: 'Main' },
  { name: 'Patio', branch: 'Main' },
]

describe('resolveAllowedRooms (RN multi-cashier parity)', () => {
  it('returns all branch rooms when multiple cashier is off', () => {
    expect(
      resolveAllowedRooms({
        multipleCashier: false,
        assignedRooms: [{ name: 'Hall A', branch: 'Main' }],
        branchRooms,
      })
    ).toEqual(branchRooms)
  })

  it('filters to assigned named rooms when multiple cashier is on', () => {
    expect(
      resolveAllowedRooms({
        multipleCashier: true,
        assignedRooms: [
          { name: 'Hall A', branch: 'Main' },
          { name: 'Patio', branch: 'Main' },
        ],
        branchRooms,
      })
    ).toEqual([
      { name: 'Hall A', branch: 'Main' },
      { name: 'Patio', branch: 'Main' },
    ])
  })

  it('treats null assignment as branch-wide (all rooms)', () => {
    expect(
      resolveAllowedRooms({
        multipleCashier: true,
        assignedRooms: [{ name: null, branch: 'Main' }],
        branchRooms,
      })
    ).toEqual(branchRooms)
  })

  it('treats empty-string assignment as branch-wide', () => {
    expect(
      resolveAllowedRooms({
        multipleCashier: true,
        assignedRooms: [{ name: '', branch: 'Main' }],
        branchRooms,
      })
    ).toEqual(branchRooms)
  })

  it('returns empty when multi-cashier has no usable assignments', () => {
    expect(
      resolveAllowedRooms({
        multipleCashier: true,
        assignedRooms: [],
        branchRooms,
      })
    ).toEqual([])
  })

  it('falls back to assigned names when branch list is still empty', () => {
    expect(
      resolveAllowedRooms({
        multipleCashier: true,
        assignedRooms: [{ name: 'Hall A', branch: 'Main' }],
        branchRooms: [],
      })
    ).toEqual([{ name: 'Hall A', branch: 'Main' }])
  })
})
