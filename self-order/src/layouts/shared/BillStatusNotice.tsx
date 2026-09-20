import { t } from '../../i18n'
import type { BillStatus } from '../../lib/api'

/**
 * The counter's answer, on the customer's own screen.
 *
 * Asking for the bill used to end in silence: the customer tapped a button
 * that greyed itself out and then had no idea whether anyone had seen it.
 * These three lines are the round trip — sent, picked up by a cashier, and
 * printed — fed by the status the page polls while it waits.
 */
export function BillStatusNotice({ status }: { status: BillStatus | null }) {
  if (!status) return null

  const tone =
    status === 'printed'
      ? 'border-green-600/40 bg-green-500/10 text-green-800 dark:text-green-300'
      : status === 'acknowledged'
        ? 'border-primary/40 bg-primary/10 text-foreground'
        : 'border-border bg-muted text-muted-foreground'

  return (
    <p
      role="status"
      aria-live="polite"
      className={`mt-2 rounded-lg border px-3 py-2 text-center text-sm font-medium ${tone}`}
    >
      {t(`order.bill_status_${status}`)}
    </p>
  )
}

export default BillStatusNotice
