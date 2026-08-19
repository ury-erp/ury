import { useState } from 'react'
import { assignDeviceTable, type OrderingContext } from '../lib/api'
import TabletLayout from './TabletLayout'

type Step = 'pin' | 'table'

const MIN_PIN_LENGTH = 4
const MAX_PIN_LENGTH = 6

// Same storage keys useDeviceBootstrap.ts uses for a provisioned device's
// credentials — a portable/shared tablet is still a provisioned
// URY Ordering Device (device_type "Portable Tablet", table_mode
// "Selectable"), it just can't bootstrap straight into an ordering context
// the way a fixed-table/kiosk device does, because it has no table until
// staff assign one here.
const DEVICE_ID_KEY = 'ury_device_id'
const DEVICE_CREDENTIAL_KEY = 'ury_device_credential'

/**
 * Standalone screen for the "portable/shared tablet" scenario: staff enters
 * a PIN and picks a table before handing the tablet to a customer. Calls
 * the real `assign_device_table` backend endpoint (device credential +
 * staff PIN + table -> a bound ordering session), then hands off straight
 * into the normal ordering view via `TabletLayout`'s `initialContext` prop
 * — the same pattern `App.tsx` already uses for device-bootstrapped
 * sessions, so this screen never re-bootstraps once assigned.
 *
 * There is no customer-safe "list tables for this branch" endpoint yet, so
 * the table picker stays a free-text field (table name/number) rather than
 * a real picker — building a new tables-listing endpoint was out of scope
 * for this MVP pass. The backend still validates the table exists and
 * belongs to the device's branch, so a bad value is rejected, not silently
 * accepted.
 */
function PortableTabletAssignment() {
  const [step, setStep] = useState<Step>('pin')
  const [pin, setPin] = useState('')
  const [table, setTable] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [context, setContext] = useState<OrderingContext | null>(null)

  function handlePinDigit(digit: string) {
    if (pin.length >= MAX_PIN_LENGTH) return
    setPin((prev) => prev + digit)
  }

  function handlePinBackspace() {
    setPin((prev) => prev.slice(0, -1))
  }

  function handlePinSubmit() {
    if (pin.length < MIN_PIN_LENGTH) return
    // The PIN itself is only verified server-side, at assignment time —
    // this just advances to table entry once enough digits are entered.
    setError(null)
    setStep('table')
  }

  async function handleAssign() {
    if (!table.trim() || submitting) return

    const deviceId = localStorage.getItem(DEVICE_ID_KEY)
    const deviceCredential = localStorage.getItem(DEVICE_CREDENTIAL_KEY)
    if (!deviceId || !deviceCredential) {
      setError('This tablet is not provisioned. Please contact staff.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const assigned = await assignDeviceTable(deviceId, deviceCredential, pin, table.trim())
      setContext(assigned)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not assign this table. Please check the PIN and try again.')
      setPin('')
      setStep('pin')
    } finally {
      setSubmitting(false)
    }
  }

  if (context) {
    return <TabletLayout initialContext={context} />
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-semibold">Assign This Tablet</h1>
        <p className="text-sm text-muted-foreground">Bind a portable tablet to a table</p>
      </div>

      {error && (
        <div className="w-full max-w-xs rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          <div className="font-medium mb-1">Assignment Failed</div>
          <div>{error}</div>
        </div>
      )}

      {step === 'pin' && (
        <div className="flex w-full max-w-xs flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="pin-display" className="text-sm font-semibold text-foreground">
              Staff PIN
            </label>
            <p className="text-xs text-muted-foreground">Enter the 4-6 digit PIN to proceed</p>
          </div>

          <div className="flex justify-center gap-2" aria-label="PIN entry" id="pin-display">
            {Array.from({ length: MAX_PIN_LENGTH }).map((_, idx) => (
              <div
                key={idx}
                className={`flex h-14 w-12 items-center justify-center rounded-lg border-2 text-2xl font-semibold transition-all ${
                  idx < pin.length
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-input bg-background text-transparent'
                }`}
              >
                {idx < pin.length ? '•' : ''}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((key, idx) =>
              key === '' ? (
                <div key={idx} />
              ) : (
                <button
                  key={idx}
                  onClick={() => (key === '⌫' ? handlePinBackspace() : handlePinDigit(key))}
                  className={`flex h-16 w-16 items-center justify-center rounded-xl border-2 text-lg font-semibold transition-all active:scale-95 ${
                    key === '⌫'
                      ? 'border-input bg-background hover:bg-muted text-foreground'
                      : 'border-input bg-background hover:bg-muted text-foreground'
                  }`}
                >
                  {key}
                </button>
              ),
            )}
          </div>

          <button
            onClick={handlePinSubmit}
            disabled={pin.length < MIN_PIN_LENGTH}
            className="w-full rounded-lg bg-primary py-4 text-base font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        </div>
      )}

      {step === 'table' && (
        <div className="flex w-full max-w-xs flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="table-input" className="text-sm font-semibold text-foreground">
              Table Name or Code
            </label>
            <p className="text-xs text-muted-foreground">Enter the table identifier to assign</p>
          </div>

          <div className="flex flex-col gap-1">
            <input
              id="table-input"
              value={table}
              onChange={(event) => setTable(event.target.value)}
              placeholder="e.g. T12, Table A, 5"
              disabled={submitting}
              className="rounded-lg border border-input bg-background px-4 py-3 text-base placeholder:text-muted-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {table && (
              <p className="text-xs text-muted-foreground">
                {table.length} character{table.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          <button
            onClick={handleAssign}
            disabled={!table.trim() || submitting}
            className="flex items-center justify-center gap-2 w-full rounded-lg bg-primary py-4 text-base font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                Assigning…
              </>
            ) : (
              'Assign Table'
            )}
          </button>

          <button
            onClick={() => setStep('pin')}
            disabled={submitting}
            className="w-full rounded-lg border border-input bg-background py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Back
          </button>
        </div>
      )}
    </div>
  )
}

export default PortableTabletAssignment
