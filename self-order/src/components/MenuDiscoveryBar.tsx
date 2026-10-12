import { ALL_COURSES, type MenuDiscovery } from '../hooks/useMenuDiscovery'
import { t } from '../i18n'

interface Props {
  discovery: MenuDiscovery
  /** Kiosks are used standing, at arm's length, so their controls run larger. */
  size?: 'default' | 'large'
}

/**
 * The search box and course chips, shared by every self-ordering layout so a
 * guest finds a dish the same way on any of them (UX-21).
 */
export function MenuDiscoveryBar({ discovery, size = 'default' }: Props) {
  const { courses, course, setCourse, query, setQuery } = discovery
  const large = size === 'large'

  return (
    <div className={large ? 'space-y-4' : 'space-y-3'}>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('menu.search_placeholder')}
        aria-label={t('menu.search_placeholder')}
        className={[
          'w-full rounded-xl border bg-background px-4 outline-none transition focus:border-primary',
          large ? 'h-14 text-lg' : 'h-11 text-sm',
        ].join(' ')}
      />

      {courses.length > 0 && (
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Chip
            label={t('menu.all_items')}
            active={course === ALL_COURSES}
            large={large}
            onClick={() => setCourse(ALL_COURSES)}
          />
          {courses.map((entry) => (
            <Chip
              key={entry.value}
              label={entry.label}
              active={course === entry.value}
              large={large}
              onClick={() => setCourse(entry.value)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Chip({
  label,
  active,
  large,
  onClick,
}: {
  label: string
  active: boolean
  large: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={[
        'shrink-0 whitespace-nowrap rounded-full font-medium transition active:scale-95',
        large ? 'px-6 py-3 text-lg' : 'px-4 py-2 text-sm',
        active ? 'bg-primary text-primary-foreground' : 'border bg-background text-muted-foreground',
      ].join(' ')}
    >
      {label}
    </button>
  )
}
