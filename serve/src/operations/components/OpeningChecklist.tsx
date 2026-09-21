import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
  cn,
} from '@ury/ui'
import {
  fetchOpeningChecklist,
  isMandatory,
  submitOpeningChecklist,
  type ChecklistItem,
  type SubmitChecklistItem,
} from '../api/checklist'
import type { OperationsIdentityProps } from '../types'
import { extractServerErrorMessage } from '../types'

export interface OpeningChecklistProps extends OperationsIdentityProps {
  /** Called only after checklist is Complete (or empty with no blockers). */
  onReady: () => void
  /** Optional POS Opening Entry name for the log link. */
  posOpeningEntry?: string
  className?: string
}

interface RowState {
  item_label: string
  is_mandatory: boolean
  is_checked: boolean
  remarks: string
}

function toRows(items: ChecklistItem[]): RowState[] {
  return items.map((item) => ({
    item_label: item.item_label,
    is_mandatory: isMandatory(item),
    is_checked: false,
    remarks: '',
  }))
}

/**
 * Non-dismissible Opening checklist gate (shared Dialog focus trap).
 * Fail-closed on load/submit errors. Invokes onReady only when status is Complete.
 */
export function OpeningChecklist({
  user,
  posProfile,
  branch,
  onReady,
  posOpeningEntry,
  className,
}: OpeningChecklistProps) {
  const [rows, setRows] = useState<RowState[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [hasAttemptedAutoSubmit, setHasAttemptedAutoSubmit] = useState(false)
  const [gateSatisfied, setGateSatisfied] = useState(false)

  const onReadyRef = useRef(onReady)
  const readyFiredRef = useRef(false)
  const mountedRef = useRef(true)
  const requestGenRef = useRef(0)
  const identityRef = useRef({ user, posProfile })

  onReadyRef.current = onReady
  identityRef.current = { user, posProfile }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      requestGenRef.current += 1
    }
  }, [])

  const isLive = useCallback((generation: number) => {
    return (
      mountedRef.current &&
      generation === requestGenRef.current &&
      identityRef.current.user === user &&
      identityRef.current.posProfile === posProfile
    )
  }, [user, posProfile])

  const fireReady = useCallback(
    (generation: number) => {
      if (!isLive(generation) || readyFiredRef.current) return
      readyFiredRef.current = true
      setGateSatisfied(true)
      onReadyRef.current()
    },
    [isLive]
  )

  const load = useCallback(async () => {
    if (!posProfile || !user) {
      setLoadError('Missing user or POS profile for checklist.')
      setLoading(false)
      return
    }

    const generation = ++requestGenRef.current
    readyFiredRef.current = false
    setLoading(true)
    setLoadError(null)
    setSubmitError(null)
    setHasAttemptedAutoSubmit(false)
    setGateSatisfied(false)

    try {
      const { items, logStatus } = await fetchOpeningChecklist(posProfile)
      if (!isLive(generation)) return

      if (logStatus === 'Complete') {
        setRows([])
        setHasAttemptedAutoSubmit(true)
        setLoading(false)
        fireReady(generation)
        return
      }
      setRows(toRows(items))
    } catch (error) {
      if (!isLive(generation)) return
      setLoadError(
        extractServerErrorMessage(error, 'Failed to load opening checklist')
      )
      setRows([])
    } finally {
      if (isLive(generation)) setLoading(false)
    }
  }, [posProfile, user, fireReady, isLive])

  useEffect(() => {
    void load()
  }, [load])

  const runEmptySubmit = useCallback(async () => {
    const generation = requestGenRef.current
    setSubmitting(true)
    setSubmitError(null)
    try {
      const response = await submitOpeningChecklist(
        posProfile,
        [],
        posOpeningEntry
      )
      if (!isLive(generation)) return
      if (response.status === 'Complete') {
        fireReady(generation)
      } else {
        setSubmitError(
          'Checklist is still incomplete. Retry or contact a manager.'
        )
      }
    } catch (error) {
      if (!isLive(generation)) return
      setSubmitError(
        extractServerErrorMessage(error, 'Failed to submit opening checklist')
      )
    } finally {
      if (isLive(generation)) {
        setSubmitting(false)
        setHasAttemptedAutoSubmit(true)
      }
    }
  }, [posProfile, posOpeningEntry, fireReady, isLive])

  useEffect(() => {
    if (
      loading ||
      loadError ||
      gateSatisfied ||
      rows.length > 0 ||
      submitting ||
      hasAttemptedAutoSubmit
    ) {
      return
    }
    void runEmptySubmit()
  }, [
    loading,
    loadError,
    gateSatisfied,
    rows.length,
    submitting,
    hasAttemptedAutoSubmit,
    runEmptySubmit,
  ])

  const allMandatoryChecked = useMemo(
    () => rows.every((row) => !row.is_mandatory || row.is_checked),
    [rows]
  )

  const handleSubmit = async () => {
    if (!allMandatoryChecked || submitting) return
    const generation = requestGenRef.current
    setSubmitting(true)
    setSubmitError(null)
    const items: SubmitChecklistItem[] = rows.map((row) => ({
      item_label: row.item_label,
      is_checked: row.is_checked,
      remarks: row.remarks,
    }))
    try {
      const response = await submitOpeningChecklist(
        posProfile,
        items,
        posOpeningEntry
      )
      if (!isLive(generation)) return
      if (response.status === 'Complete') {
        fireReady(generation)
      } else {
        setSubmitError('Complete all mandatory items before continuing.')
      }
    } catch (error) {
      if (!isLive(generation)) return
      setSubmitError(
        extractServerErrorMessage(error, 'Failed to submit opening checklist')
      )
    } finally {
      if (isLive(generation)) setSubmitting(false)
    }
  }

  const retrySubmit = () => {
    setSubmitError(null)
    if (rows.length === 0) {
      // Direct retry — do not leave the footer Submit disabled forever.
      void runEmptySubmit()
      return
    }
    void handleSubmit()
  }

  if (gateSatisfied) {
    return null
  }

  return (
    <Dialog
      open
      // Non-dismissible gate: ignore dismiss requests from overlay / Escape.
      onOpenChange={() => undefined}
      closeOnEscape={false}
      className={className}
    >
      <DialogContent
        variant="large"
        showCloseButton={false}
        className={cn(
          'flex max-h-[90vh] w-full max-w-lg flex-col gap-0 p-0',
          className
        )}
      >
        <DialogHeader className="border-b border-border px-4 py-3 text-left sm:text-left">
          <DialogTitle>Opening checklist</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Complete mandatory items before taking orders
            {branch ? ` · ${branch}` : ''}
          </p>
        </DialogHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {loading && <Spinner message="Loading checklist…" />}

          {loadError && (
            <Alert variant="danger">
              <p className="font-medium">Checklist unavailable</p>
              <p className="text-sm">{loadError}</p>
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                onClick={() => void load()}
              >
                Retry
              </Button>
            </Alert>
          )}

          {!loading &&
            !loadError &&
            rows.map((row, index) => (
              <label
                key={`${row.item_label}-${index}`}
                className="flex cursor-pointer flex-col gap-2 rounded-lg border border-border p-3"
              >
                <span className="flex items-start gap-3">
                  <Checkbox
                    checked={row.is_checked}
                    disabled={submitting}
                    aria-required={row.is_mandatory}
                    onChange={(event) => {
                      const checked = event.target.checked
                      setRows((prev) =>
                        prev.map((item, i) =>
                          i === index ? { ...item, is_checked: checked } : item
                        )
                      )
                    }}
                  />
                  <span className="min-w-0 flex-1 text-sm">
                    {row.item_label}
                    {row.is_mandatory ? (
                      <span className="ml-1 text-destructive" aria-hidden>
                        *
                      </span>
                    ) : null}
                  </span>
                </span>
                <Input
                  aria-label={`Remarks for ${row.item_label}`}
                  placeholder="Remarks (optional)"
                  value={row.remarks}
                  disabled={submitting}
                  onChange={(event) => {
                    const remarks = event.target.value
                    setRows((prev) =>
                      prev.map((item, i) =>
                        i === index ? { ...item, remarks } : item
                      )
                    )
                  }}
                />
              </label>
            ))}

          {submitError && (
            <Alert variant="danger">
              <p className="text-sm">{submitError}</p>
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                disabled={submitting}
                onClick={() => retrySubmit()}
              >
                Retry
              </Button>
            </Alert>
          )}
        </div>

        <DialogFooter className="border-t border-border px-4 py-3 sm:justify-end">
          <Button
            type="button"
            disabled={
              loading ||
              Boolean(loadError) ||
              submitting ||
              rows.length === 0 ||
              !allMandatoryChecked
            }
            onClick={() => void handleSubmit()}
          >
            {submitting ? 'Submitting…' : 'Submit checklist'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
