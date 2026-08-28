import { useState } from 'react'

type Step = 'pin' | 'table'

const MIN_PIN_LENGTH = 4
const MAX_PIN_LENGTH = 6

/**
 * Standalone screen for the "portable/shared tablet" scenario: staff enters
 * a PIN and picks a table before handing the tablet to a customer.
 *
 * There is currently NO backend endpoint for "staff PIN + table selection
 * -> customer session" (only QR-token and device-credential bootstrap
 * exist — see `get_ordering_context` in
 * ury/ury/ury/api/self_ordering.py). This is therefore a UI shell only:
 * any PIN of MIN_PIN_LENGTH+ digits is treated as "accepted" (no real
 * verification), and there is no customer-safe "list all tables" endpoint
 * either, so the table picker is a free-text field rather than a real
 * picker. Submitting does not create a session — it surfaces the gap
 * instead of silently pretending to succeed.
 */
function PortableTabletAssignment() {
  const [step, setStep] = useState<Step>('pin')
  const [pin, setPin] = useState('')
  const [table, setTable] = useState('')

  function handlePinDigit(digit: string) {
    if (pin.length >= MAX_PIN_LENGTH) return
    setPin((prev) => prev + digit)
  }

  function handlePinBackspace() {
    setPin((prev) => prev.slice(0, -1))
  }

  function handlePinSubmit() {
    if (pin.length < MIN_PIN_LENGTH) return
    // UI shell only — any PIN of sufficient length is treated as accepted.
    // There is no real staff-PIN verification endpoint yet.
    setStep('table')
  }

  function handleAssign() {
    if (!table.trim()) return
    // TODO(backend): needs a staff-PIN + table-selection endpoint before
    // this can create a real session. Until then, this screen cannot hand
    // off a working session to a customer.
    window.alert('Backend endpoint not yet available — see TODO in this file')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-xl font-semibold">Assign This Tablet</h1>

      {step === 'pin' && (
        <div className="flex w-full max-w-xs flex-col items-center gap-4">
          <p className="text-sm text-muted-foreground">Enter staff PIN</p>
          <div className="flex gap-2" aria-label="PIN entry">
            {Array.from({ length: MAX_PIN_LENGTH }).map((_, idx) => (
              <div
                key={idx}
                className={`h-10 w-8 rounded-md border text-center text-lg leading-10 ${
                  idx < pin.length ? 'bg-muted' : ''
                }`}
              >
                {idx < pin.length ? '•' : ''}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((key, idx) =>
              key === '' ? (
                <div key={idx} />
              ) : (
                <button
                  key={idx}
                  onClick={() => (key === '⌫' ? handlePinBackspace() : handlePinDigit(key))}
                  className="h-14 w-14 rounded-full border text-lg font-medium active:scale-95"
                >
                  {key}
                </button>
              ),
            )}
          </div>
          <button
            onClick={handlePinSubmit}
            disabled={pin.length < MIN_PIN_LENGTH}
            className="w-full rounded-md bg-primary py-3 font-medium text-primary-foreground disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      )}

      {step === 'table' && (
        <div className="flex w-full max-w-xs flex-col gap-4">
          <p className="text-sm text-muted-foreground">Enter table name or code</p>
          <input
            value={table}
            onChange={(event) => setTable(event.target.value)}
            placeholder="e.g. T12"
            className="rounded-md border px-4 py-3 text-base"
          />
          <button
            onClick={handleAssign}
            disabled={!table.trim()}
            className="w-full rounded-md bg-primary py-3 font-medium text-primary-foreground disabled:opacity-50"
          >
            Assign Table
          </button>
          <button
            onClick={() => setStep('pin')}
            className="w-full rounded-md border py-3 text-sm font-medium"
          >
            Back
          </button>
        </div>
      )}
    </div>
  )
}

export default PortableTabletAssignment
