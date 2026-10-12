import { Languages } from 'lucide-react'
import { t, getActiveLanguage, setLanguage } from '../i18n'
import { SUPPORTED_LANGUAGES } from '../i18n/config'

/**
 * Compact language toggle for the self-order shells.
 *
 * Customer-facing and touch-first, so it renders every language as a single
 * tap target labelled in its own script rather than hiding choices behind a
 * dropdown — a diner should never have to hunt for their language, and a
 * kiosk has no signed-in user whose preference we could read.
 */
export function LanguageToggle({ className = '' }: { className?: string }) {
  const active = getActiveLanguage()
  const codes = Object.keys(SUPPORTED_LANGUAGES)

  // With a single configured language there is nothing to choose.
  if (codes.length < 2) return null

  return (
    <div
      className={`flex items-center gap-1 rounded-md border p-0.5 ${className}`}
      role="group"
      aria-label={t('language.label')}
    >
      <Languages className="mx-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      {codes.map((code) => (
        <button
          key={code}
          lang={code}
          aria-pressed={code === active}
          onClick={() => setLanguage(code)}
          className={`rounded px-2 py-1 text-sm font-medium transition-colors ${
            code === active
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          {SUPPORTED_LANGUAGES[code]}
        </button>
      ))}
    </div>
  )
}

export default LanguageToggle
