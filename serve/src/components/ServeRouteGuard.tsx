import React, { useCallback, useEffect, useState } from 'react'
import { Button, Spinner } from '@ury/ui'
import { useCaptainContext } from '../hooks/useCaptainContext'
import { validatePOSClose } from '../lib/pos-opening-api'
import ServiceRequestPanel from './ServiceRequestPanel'
import { OpeningChecklist } from '../operations'

interface Props {
  children: React.ReactNode
}

/** Only an explicit Success string admits Serve. Anything else fails closed. */
export function isSuccessfulPOSCloseMessage(message: unknown): boolean {
  return message === 'Success'
}

const ServeRouteGuard: React.FC<Props> = ({ children }) => {
  const { capabilities, openingState, branch, context, isLoading, error, refetch } =
    useCaptainContext()
  const [dailyCloseOk, setDailyCloseOk] = useState<boolean | null>(null)
  const [dailyCloseError, setDailyCloseError] = useState<string | null>(null)
  const [checklistDone, setChecklistDone] = useState(false)
  const [checkingClose, setCheckingClose] = useState(false)

  const profileName = context?.pos_profile?.name ?? null
  const userName = context?.user ?? null

  // Re-run opening checklist when session identity or POS profile changes.
  useEffect(() => {
    setChecklistDone(false)
  }, [userName, profileName])

  const runCloseValidation = useCallback(async () => {
    if (!profileName) {
      setDailyCloseOk(false)
      setDailyCloseError('POS profile missing from captain context.')
      return
    }
    setCheckingClose(true)
    setDailyCloseOk(null)
    setDailyCloseError(null)
    try {
      const res = await validatePOSClose(profileName)
      if (isSuccessfulPOSCloseMessage(res?.message)) {
        setDailyCloseOk(true)
        return
      }
      setDailyCloseOk(false)
      if (res?.message === 'Failed') {
        setDailyCloseError(
          'Previous POS day is not closed. Ask a manager to close it first.'
        )
      } else {
        setDailyCloseError(
          'Could not confirm prior-day POS close. Recheck or ask a manager.'
        )
      }
    } catch (err) {
      setDailyCloseOk(false)
      setDailyCloseError(err instanceof Error ? err.message : 'Failed to validate POS close')
    } finally {
      setCheckingClose(false)
    }
  }, [profileName])

  useEffect(() => {
    if (!isLoading && !error && profileName) {
      void runCloseValidation()
    }
    if (!isLoading && !profileName) {
      setDailyCloseOk(false)
      setDailyCloseError('POS profile missing from captain context.')
    }
  }, [isLoading, error, profileName, runCloseValidation])

  if (isLoading || checkingClose || (profileName && dailyCloseOk === null)) {
    return (
      <div className="min-h-screen">
        <Spinner message="Checking Serve access…" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <h2 className="mb-2 text-xl font-semibold text-gray-800">Unable to load Serve</h2>
          <p className="text-gray-600">{error}</p>
          <Button className="mt-4" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  if (!profileName || !userName) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <h2 className="mb-2 text-xl font-semibold text-gray-800">Session incomplete</h2>
          <p className="text-gray-600">
            Captain context did not return a user or POS profile.
          </p>
          <Button className="mt-4" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  if (openingState == null) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <h2 className="mb-2 text-xl font-semibold text-gray-800">Opening state unknown</h2>
          <p className="text-gray-600">
            Cannot confirm whether POS is open. Retry or open POS from Desk.
          </p>
          <Button className="mt-4" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  if (openingState.pos_open === false) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <h2 className="mb-2 text-xl font-semibold text-gray-800">POS is not open</h2>
          <p className="text-gray-600">
            Ask a cashier or manager to open the POS before taking table orders.
          </p>
          <Button className="mt-4" onClick={() => void refetch()}>
            Recheck
          </Button>
        </div>
      </div>
    )
  }

  if (dailyCloseOk !== true) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <h2 className="mb-2 text-xl font-semibold text-gray-800">POS close required</h2>
          <p className="text-gray-600">
            {dailyCloseError ??
              'Could not confirm prior-day POS close. Recheck or ask a manager.'}
          </p>
          <Button className="mt-4" onClick={() => void runCloseValidation()}>
            Recheck
          </Button>
        </div>
      </div>
    )
  }

  if (!capabilities?.canTakeTableOrders) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <h2 className="mb-2 text-xl font-semibold text-gray-800">Not permitted</h2>
          <p className="text-gray-600">You do not have permission to take table orders.</p>
        </div>
      </div>
    )
  }

  if (!checklistDone) {
    return (
      <OpeningChecklist
        user={userName}
        posProfile={profileName}
        branch={branch ?? undefined}
        onReady={() => setChecklistDone(true)}
      />
    )
  }

  return (
    <>
      {children}
      <ServiceRequestPanel branch={branch} />
    </>
  )
}

export default ServeRouteGuard
