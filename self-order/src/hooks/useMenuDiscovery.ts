import { useMemo, useState } from 'react'
import type { MenuItem } from '../lib/api'

export const ALL_COURSES = '__all__'

export interface MenuDiscovery {
  courses: Array<{ value: string; label: string }>
  course: string
  setCourse: (course: string) => void
  query: string
  setQuery: (query: string) => void
  visibleMenu: MenuItem[]
}

/**
 * Search and course filtering for the customer menu, in one place.
 *
 * The four self-ordering layouts had drifted apart: the phone had nothing,
 * the portrait kiosk had categories, the tablet and landscape kiosk had
 * neither. Whether a guest could find a dish depended on which screen they
 * happened to be standing at (UX-21).
 *
 * Courses come out in menu order rather than alphabetical. A menu is
 * sequenced by the kitchen — starters before mains — and sorting it
 * destroys that intent for no gain.
 */
/** Grouped by category (Item Group), like the POS; course only for old menus. */
const groupOf = (item: MenuItem) => item.category || item.course

export function useMenuDiscovery(menu: MenuItem[]): MenuDiscovery {
  const [course, setCourse] = useState<string>(ALL_COURSES)
  const [query, setQuery] = useState('')

  const courses = useMemo(() => {
    const seen = new Map<string, string>()
    menu.forEach((item) => {
      const key = groupOf(item)
      if (key && !seen.has(key)) {
        seen.set(key, item.category_label || item.course_label || key)
      }
    })
    return Array.from(seen, ([value, label]) => ({ value, label }))
  }, [menu])

  const visibleMenu = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return menu.filter((item) => {
      if (course !== ALL_COURSES && groupOf(item) !== course) return false
      if (!needle) return true
      return item.item_name.toLowerCase().includes(needle)
    })
  }, [menu, course, query])

  return { courses, course, setCourse, query, setQuery, visibleMenu }
}
