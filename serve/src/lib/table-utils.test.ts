import { describe, expect, it } from 'vitest'
import {
  canUnmergeTable,
  getTableMergeActions,
  sortTablesByMergeGroups,
} from './table-utils'
import type { Table } from './table-api'

const base = {
  latest_invoice_time: null,
  is_take_away: 0,
  restaurant_room: 'A',
  table_shape: 'Square' as const,
}

describe('sortTablesByMergeGroups', () => {
  it('keeps free tables stable', () => {
    const tables = [
      { name: 'T2', occupied: 0, restaurant_room: 'A' },
      { name: 'T1', occupied: 0, restaurant_room: 'A' },
    ] as Table[]
    const sorted = sortTablesByMergeGroups(tables)
    expect(sorted.map((t) => t.name)).toEqual(['T1', 'T2'])
  })
})

describe('table merge/unmerge actions (tables only)', () => {
  it('always offers merge; unmerge only when cluster is free', () => {
    const freeMerged: Table[] = [
      { ...base, name: 'T1', occupied: 0, merged_with: 'T2' },
      { ...base, name: 'T2', occupied: 0, merged_with: 'T1' },
    ]
    expect(getTableMergeActions(freeMerged[0], freeMerged)).toEqual({
      showMerge: true,
      showUnmerge: true,
    })
    expect(canUnmergeTable(freeMerged[0], freeMerged)).toBe(true)
  })

  it('hides unmerge when any cluster member is occupied', () => {
    const mixed: Table[] = [
      { ...base, name: 'T1', occupied: 1, merged_with: 'T2' },
      { ...base, name: 'T2', occupied: 0, merged_with: 'T1' },
    ]
    expect(getTableMergeActions(mixed[0], mixed).showUnmerge).toBe(false)
    expect(canUnmergeTable(mixed[0], mixed)).toBe(false)
  })
})
