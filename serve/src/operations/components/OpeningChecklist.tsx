import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
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
  fetchClosingChecklist,
  fetchOpeningChecklist,
  isMandatory,
  submitClosingChecklist,
  submitOpeningChecklist,
  type ChecklistBlocker,
  type ChecklistItem,
  type ChecklistType,
  type SubmitChecklistItem,
} from '../api/checklist'
import type { OperationsIdentityProps } from '../types'
import { extractServerErrorMessage } from '../types'

export interface ChecklistGateProps extends OperationsIdentityProps {
  /** Opening gate (RM → Cashier → Order Taker) or Closing (OT → Cashier → RM). */
  checklistType: ChecklistType
  /** Called only after checklist is Complete (or empty with no blockers). */
  onReady: () => void
  /** Optional POS Opening Entry name for the log link. */
  posOpeningEntry?: string
  className?: string
  /**
   * Dismissible dialogs (user-triggered, e.g. the Closing icon) show a Close
   * button and react to overlay / Escape; non-dismissible gates ignore them.
   */
  dismissible?: boolean
  /** Dismiss handler for dismissible dialogs. */
  onClose?: () => void
}

export interface OpeningChecklistProps extends OperationsIdentityProps {
  /** Called only after checklist is Complete (or empty with no blockers). */
  onReady: () => void
  /** Optional POS Opening Entry name for the log link. */
  posOpeningEntry?: string
  className?: string
}

export interface ClosingChecklistProps extends OperationsIdentityProps {
  /** Called after the closing checklist is submitted (or already complete). */
  onClose: () => void
  className?: string
}

interface RowState {
  item_label: string
  is_mandatory: boolean
  status: 'Passed' | 'Failed' | null
  remarks: string
  goal?: string | null
}

function toRows(items: ChecklistItem[]): RowState[] {
  return items.map((item) => ({
    item_label: item.item_label,
    is_mandatory: isMandatory(item),
    // Prefill the result the user saved last time (failed items resurface
    // with their previous selection so they can review or correct it).
    status: item.status === 'Passed' || item.status === 'Failed' ? item.status : null,
    remarks: item.remarks ?? '',
    goal: item.goal ?? null,
  }))
}

const PHASE_COPY = {
  Opening: {
    title: 'Opening checklist',
    subtitle: 'Complete mandatory items before taking orders',
    blockedHeading: 'Opening checklist required',
  },
  Closing: {
    title: 'Closing checklist',
    subtitle: 'Complete mandatory items before closing',
    blockedHeading: 'Closing checklist required',
  },
} as const

/**
 * Checklist gate dialog shared by the Opening gate and the Closing entry
 * point. Non-dismissible on load/submit errors; invokes onReady only when
 * status is Complete. Dismissible variants (Closing) additionally render a
 * Close button and close via onClose.
 */
export function ChecklistGate({
  user,
  posProfile,
  branch,
  checklistType,
  onReady,
  posOpeningEntry,
  className,
  dismissible = false,
  onClose,
}: ChecklistGateProps) {
  const copy = PHASE_COPY[checklistType]
  const [rows, setRows] = useState<RowState[]>([])
  const [blockedBy, setBlockedBy] = useState<ChecklistBlocker | null>(null)
  const [alreadyComplete, setAlreadyComplete] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [hasAttemptedAutoSubmit, setHasAttemptedAutoSubmit] = useState(false)
  const [gateSatisfied, setGateSatisfied] = useState(false)
  // STATE 2 of the gate UX: the user is eligible (no predecessor block) but
  // has not started their checklist yet. The form stays hidden until they
  // press Start Checklist so the screen always offers a clear action.
  const [started, setStarted] = useState(false)

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
    setBlockedBy(null)
    setAlreadyComplete(false)
    setStarted(false)

    try {
      const { items, logStatus, blockedBy } =
        checklistType === 'Opening'
          ? await fetchOpeningChecklist(posProfile)
          : await fetchClosingChecklist(posProfile)
      if (!isLive(generation)) return

      if (blockedBy) {
        // A predecessor role has not finished this phase's checklist; the
        // gate stays closed with a specific message instead of the form.
        setBlockedBy(blockedBy)
        setRows([])
        setLoading(false)
        return
      }

      if (logStatus === 'Complete') {
        setRows([])
        if (dismissible) {
          // Nothing pending: let the user acknowledge instead of instantly
          // dismissing the dialog they just opened.
          setAlreadyComplete(true)
          setHasAttemptedAutoSubmit(true)
        } else {
          setHasAttemptedAutoSubmit(true)
          fireReady(generation)
        }
        setLoading(false)
        return
      }
      setRows(toRows(items))
    } catch (error) {
      if (!isLive(generation)) return
      setLoadError(
        extractServerErrorMessage(
          error,
          `Failed to load ${checklistType.toLowerCase()} checklist`
        )
      )
      setRows([])
    } finally {
      if (isLive(generation)) setLoading(false)
    }
  }, [posProfile, user, checklistType, dismissible, fireReady, isLive])

  useEffect(() => {
    void load()
  }, [load])

  const runEmptySubmit = useCallback(async () => {
    const generation = requestGenRef.current
    setSubmitting(true)
    setSubmitError(null)
    try {
      const response =
        checklistType === 'Opening'
          ? await submitOpeningChecklist(posProfile, [], posOpeningEntry)
          : await submitClosingChecklist(posProfile, [])
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
        extractServerErrorMessage(
          error,
          `Failed to submit ${checklistType.toLowerCase()} checklist`
        )
      )
    } finally {
      if (isLive(generation)) {
        setSubmitting(false)
        setHasAttemptedAutoSubmit(true)
      }
    }
  }, [posProfile, posOpeningEntry, checklistType, fireReady, isLive])

  useEffect(() => {
    if (
      loading ||
      loadError ||
      gateSatisfied ||
      blockedBy ||
      alreadyComplete ||
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
    blockedBy,
    alreadyComplete,
    rows.length,
    submitting,
    hasAttemptedAutoSubmit,
    runEmptySubmit,
  ])

  // Every mandatory item needs an explicit result, and a FAIL must carry a
  // remark explaining it.
  const allMandatoryAnswered = useMemo(
    () => rows.every((row) => !row.is_mandatory || row.status),
    [rows]
  )
  const failuresExplained = useMemo(
    () =>
      rows.every(
        (row) => row.status !== 'Failed' || row.remarks.trim().length > 0
      ),
    [rows]
  )
  const canSubmit = allMandatoryAnswered && failuresExplained

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return
    const generation = requestGenRef.current
    setSubmitting(true)
    setSubmitError(null)
    const items: SubmitChecklistItem[] = rows.map((row) => ({
      item_label: row.item_label,
      status: row.status ?? undefined,
      remarks: row.remarks,
      goal: row.goal,
    }))
    try {
      const response =
        checklistType === 'Opening'
          ? await submitOpeningChecklist(posProfile, items, posOpeningEntry)
          : await submitClosingChecklist(posProfile, items)
      if (!isLive(generation)) return
      if (response.status === 'Complete') {
        fireReady(generation)
      } else {
        setSubmitError('Complete all mandatory items before continuing.')
      }
    } catch (error) {
      if (!isLive(generation)) return
      setSubmitError(
        extractServerErrorMessage(
          error,
          `Failed to submit ${checklistType.toLowerCase()} checklist`
        )
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

  const close = () => {
    if (submitting) return
    onClose?.()
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && dismissible) close()
      }}
      closeOnEscape={dismissible}
      className={className}
    >
      <DialogContent
        variant="large"
        showCloseButton={dismissible}
        onClose={dismissible ? close : undefined}
        className={cn(
          'flex max-h-[90vh] w-full max-w-lg flex-col gap-0 p-0',
          className
        )}
      >
        <DialogHeader className="border-b border-border px-4 py-3 text-left sm:text-left">
          <DialogTitle>{copy.title}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {copy.subtitle}
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

          {!loading && !loadError && alreadyComplete && (
            <Alert variant="success">
              <p className="font-medium">{copy.title} completed</p>
              <p className="text-sm">
                Your {checklistType.toLowerCase()} checklist has already been
                submitted for this business day.
              </p>
            </Alert>
          )}

          {!loading && !loadError && blockedBy && (
            <Alert variant="warning">
              <p className="font-medium">{copy.blockedHeading}</p>
              <p className="text-sm">
                {`${blockedBy.role_label} has not completed the ${checklistType} Checklist yet. Please ask the ${blockedBy.role_label} to complete it before continuing.`}
              </p>
              {/*
                STATE 1: the user is not eligible yet, so there is deliberately
                no Start Checklist here -- but the predecessor may submit while
                this screen is open, so offer a recheck instead of stranding the
                user on a dead-end message.
              */}
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                onClick={() => void load()}
              >
                Recheck
              </Button>
            </Alert>
          )}

          {!loading &&
            !loadError &&
            !blockedBy &&
            !alreadyComplete &&
            !started &&
            rows.length > 0 && (
              <div className="py-6 text-center">
                <p className="font-medium">{copy.blockedHeading}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {copy.subtitle}
                </p>
                {/*
                  STATE 2: the user is the eligible role -- the checklist has
                  not been started yet, so the only action here is Start.
                */}
                <Button
                  type="button"
                  className="mt-4"
                  onClick={() => setStarted(true)}
                >
                  Start Checklist
                </Button>
              </div>
            )}

          {!loading &&
            !loadError &&
            !blockedBy &&
            !alreadyComplete &&
            started &&
            rows.map((row, index) => (
              <div
                key={`${row.item_label}-${index}`}
                className="flex flex-col gap-2 rounded-lg border border-border p-3"
              >
                <span className="min-w-0 flex-1 text-sm">
                  {index + 1}. {row.item_label}
                  {row.is_mandatory ? (
                    <span className="ml-1 text-destructive" aria-hidden>
                      *
                    </span>
                  ) : null}
                </span>
                <span className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name={`checklist-result-${index}`}
                      checked={row.status === 'Passed'}
                      disabled={submitting}
                      onChange={() =>
                        setRows((prev) =>
                          prev.map((item, i) =>
                            i === index ? { ...item, status: 'Passed' as const } : item
                          )
                        )
                      }
                    />
                    PASS
                  </label>
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name={`checklist-result-${index}`}
                      checked={row.status === 'Failed'}
                      disabled={submitting}
                      onChange={() =>
                        setRows((prev) =>
                          prev.map((item, i) =>
                            i === index ? { ...item, status: 'Failed' as const } : item
                          )
                        )
                      }
                    />
                    FAIL
                  </label>
                </span>
                {row.status && (
                  <Input
                    aria-label={`Remarks for ${row.item_label}`}
                    placeholder={
                      row.status === 'Failed'
                        ? 'Explain the failure (required)'
                        : 'Remarks (optional)'
                    }
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
                )}
                {row.status === 'Failed' && !row.remarks.trim() && (
                  <p className="text-xs text-destructive">
                    Remarks are required for failed items.
                  </p>
                )}
              </div>
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
          {dismissible && (blockedBy || alreadyComplete || loadError) && (
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={close}
            >
              Close
            </Button>
          )}
          <Button
            type="button"
            disabled={
              loading ||
              Boolean(loadError) ||
              submitting ||
              rows.length === 0 ||
              !canSubmit
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
  return (
    <ChecklistGate
      user={user}
      posProfile={posProfile}
      branch={branch}
      checklistType="Opening"
      onReady={onReady}
      posOpeningEntry={posOpeningEntry}
      className={className}
    />
  )
}

/**
 * Dismissible Closing checklist dialog — the Serve entry point into the
 * Order Taker → Cashier → Restaurant Manager closing sequence. The backend
 * (get_checklist / submit_checklist) determines the current role's checklist
 * and enforces the predecessor hierarchy; a FAIL objective with a remark is a
 * valid submission and never blocks. Invokes onClose after the checklist is
 * submitted (or when it was already complete).
 */
export function ClosingChecklist({
  user,
  posProfile,
  branch,
  onClose,
  className,
}: ClosingChecklistProps) {
  return (
    <ChecklistGate
      user={user}
      posProfile={posProfile}
      branch={branch}
      checklistType="Closing"
      onReady={onClose}
      onClose={onClose}
      dismissible
      className={className}
    />
  )
}
