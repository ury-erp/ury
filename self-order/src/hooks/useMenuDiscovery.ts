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
export function useMenuDiscovery(menu: MenuItem[]): MenuDiscovery {
  const [course, setCourse] = useState<string>(ALL_COURSES)
  const [query, setQuery] = useState('')

  const courses = useMemo(() => {
    const seen = new Map<string, string>()
    menu.forEach((item) => {
      if (item.course && !seen.has(item.course)) {
        seen.set(item.course, item.course_label || item.course)
      }
    })
    return Array.from(seen, ([value, label]) => ({ value, label }))
  }, [menu])

  const visibleMenu = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return menu.filter((item) => {
      if (course !== ALL_COURSES && item.course !== course) return false
      if (!needle) return true
      return item.item_name.toLowerCase().includes(needle)
    })
  }, [menu, course, query])

  return { courses, course, setCourse, query, setQuery, visibleMenu }
}
