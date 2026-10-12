import { CookingPot, Check, Clock } from 'lucide-react'
import { t } from '../../i18n'
import type { KitchenStatus } from '../../lib/api'

const STEPS: KitchenStatus[] = ['queued', 'preparing', 'ready']

/**
 * Where the food actually is, on the customer's own screen.
 *
 * The kitchen display has always known this; the table never did, so the
 * only way to find out was to stop a member of staff and ask — which is the
 * question self-ordering was supposed to remove, not create.
 *
 * Shown as three steps rather than one line so a table can see both where
 * they are and what comes next; the label under it says the same thing in
 * words, because a row of dots on its own is a puzzle.
 */
export function KitchenStatusStrip({ status }: { status: KitchenStatus | null }) {
  if (!status) return null

  const currentIndex = STEPS.indexOf(status)
  const Icon = status === 'ready' ? Check : status === 'preparing' ? CookingPot : Clock

  return (
    <section
      role="status"
      aria-live="polite"
      className={`rounded-xl border px-4 py-3 ${
        status === 'ready'
          ? 'border-green-600/40 bg-green-500/10'
          : 'border-border bg-muted/50'
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon
          className={`h-4 w-4 shrink-0 ${
            status === 'ready' ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'
          }`}
          aria-hidden="true"
        />
        <span className="text-sm font-medium">{t(`order.kitchen_${status}`)}</span>
      </div>

      <div className="mt-2.5 flex gap-1.5" aria-hidden="true">
        {STEPS.map((step, index) => (
          <span
            key={step}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              index <= currentIndex
                ? status === 'ready'
                  ? 'bg-green-600'
                  : 'bg-primary'
                : 'bg-border'
            }`}
          />
        ))}
      </div>
    </section>
  )
}

export default KitchenStatusStrip
