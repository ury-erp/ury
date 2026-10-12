import { ConciergeBell, Check } from 'lucide-react'
import { t } from '../../i18n'
import type { OrderingContext, WaiterStatus } from '../../lib/api'

interface Props {
  context: OrderingContext | null
  status: WaiterStatus | null
  onCall: () => void
  className?: string
}

/**
 * "Call a waiter", for the table that cannot get anyone's attention.
 *
 * Deliberately available before anything has been ordered: the most common
 * reason a table needs a person is that they are stuck on the screen or want
 * to ask about a dish, which is exactly when an order does not exist yet.
 *
 * Once pressed the button stops being a button and becomes an answer —
 * "called", then "on their way" once a member of staff has actually seen it
 * on the POS. A button that just greys out tells the table nothing, which is
 * the same silence that made them press it.
 */
export function CallWaiterButton({ context, status, onCall, className }: Props) {
  if (!context?.capabilities.call_waiter_enabled) return null

  if (status) {
    return (
      <p
        role="status"
        aria-live="polite"
        className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium ${
          status === 'coming'
            ? 'border-green-600/40 bg-green-500/10 text-green-800 dark:text-green-300'
            : 'border-border bg-muted text-muted-foreground'
        } ${className ?? ''}`}
      >
        {status === 'coming' ? (
          <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
        ) : (
          <ConciergeBell className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        {t(status === 'coming' ? 'order.waiter_coming' : 'order.waiter_called')}
      </p>
    )
  }

  return (
    <button
      onClick={onCall}
      className={`flex w-full items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition active:scale-[0.99] ${className ?? ''}`}
    >
      <ConciergeBell className="h-4 w-4 shrink-0" aria-hidden="true" />
      {t('order.call_waiter')}
    </button>
  )
}

export default CallWaiterButton
