interface CategoryTabsProps {
  /** Array of unique categories derived from menu items. */
  categories: Array<{ course: string; course_label: string }>
  /**
   * Currently active course filter. `null` means show all items.
   * Matches `item.course ?? ALL_CATEGORY` logic from PortraitKioskLayout.
   */
  activeCourse: string | null
  /** Called when user clicks a category chip; pass `null` for "All". */
  onSelect: (course: string | null) => void
}

/**
 * Horizontal scrollable row of category chips/tabs, sticky under the header.
 * Includes an "All" chip and individual course category chips.
 *
 * Usage:
 * ```tsx
 * const categories = useMemo(() => {
 *   const seen = new Map<string, string>()
 *   for (const item of menu) {
 *     const key = item.course
 *     if (!seen.has(key)) {
 *       seen.set(key, item.course_label ?? item.course)
 *     }
 *   }
 *   return Array.from(seen.entries()).map(([course, label]) => ({ course, label }))
 * }, [menu])
 *
 * <CategoryTabs
 *   categories={categories}
 *   activeCourse={selectedCategory}
 *   onSelect={setSelectedCategory}
 * />
 * ```
 */
function CategoryTabs({ categories, activeCourse, onSelect }: CategoryTabsProps) {
  return (
    <nav
      aria-label="Menu categories"
      className="sticky top-0 z-10 flex gap-2 overflow-x-auto bg-background/95 px-6 py-3 backdrop-blur"
    >
      {/* "All" chip */}
      <button
        onClick={() => onSelect(null)}
        className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${
          activeCourse === null
            ? 'bg-primary text-primary-foreground'
            : 'border bg-background text-foreground hover:bg-muted'
        }`}
      >
        All
      </button>

      {/* Category chips */}
      {categories.map((category) => (
        <button
          key={category.course}
          onClick={() => onSelect(category.course)}
          className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${
            activeCourse === category.course
              ? 'bg-primary text-primary-foreground'
              : 'border bg-background text-foreground hover:bg-muted'
          }`}
        >
          {category.course_label}
        </button>
      ))}
    </nav>
  )
}

export default CategoryTabs
