import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OpeningChecklist } from '../components/OpeningChecklist'

vi.mock('../api/checklist', () => ({
  fetchOpeningChecklist: vi.fn(),
  submitOpeningChecklist: vi.fn(),
  isMandatory: (item: { is_mandatory?: boolean | number }) =>
    Boolean(Number(item.is_mandatory)),
}))

import {
  fetchOpeningChecklist,
  submitOpeningChecklist,
} from '../api/checklist'

const fetchMock = vi.mocked(fetchOpeningChecklist)
const submitMock = vi.mocked(submitOpeningChecklist)

// STATE 2 of the gate UX: an eligible user lands on a "Start Checklist"
// screen first -- tests that interact with the form click through it.
const startChecklist = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: /Start Checklist/i }))
}

describe('OpeningChecklist', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    submitMock.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('calls onReady when log is already Complete', async () => {
    const onReady = vi.fn()
    fetchMock.mockResolvedValue({
      items: [],
      logName: 'LOG-1',
      logStatus: 'Complete',
    })

    render(
      <OpeningChecklist
        user="captain@example.com"
        posProfile="POS-MAIN"
        onReady={onReady}
      />
    )

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1))
    expect(submitMock).not.toHaveBeenCalled()
  })

  it('fail-closes on load error and retries', async () => {
    const onReady = vi.fn()
    fetchMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        items: [],
        logName: null,
        logStatus: 'Complete',
      })

    const user = userEvent.setup()
    render(
      <OpeningChecklist
        user="captain@example.com"
        posProfile="POS-MAIN"
        onReady={onReady}
      />
    )

    expect(
      await screen.findByText(/Checklist unavailable/i)
    ).toBeInTheDocument()
    expect(onReady).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /Retry/i }))
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1))
  })

  it('offers Start Checklist to an eligible user before showing the form', async () => {
    fetchMock.mockResolvedValue({
      items: [{ item_label: 'Sanitize station', is_mandatory: 1 }],
      logName: null,
      logStatus: null,
    })

    const user = userEvent.setup()
    render(
      <OpeningChecklist
        user="captain@example.com"
        posProfile="POS-MAIN"
        branch="Main"
        onReady={vi.fn()}
      />
    )

    // STATE 2: required-heading + Start action, but no form yet.
    expect(
      await screen.findByRole('button', { name: /Start Checklist/i })
    ).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()

    await startChecklist(user)
    expect(await screen.findByText(/Sanitize station/)).toBeInTheDocument()
  })

  it('rechecks from the blocked state when the predecessor finishes', async () => {
    const onReady = vi.fn()
    fetchMock
      .mockResolvedValueOnce({
        items: [],
        logName: null,
        logStatus: null,
        blockedBy: { role: 'Cashier', role_label: 'Cashier', goals: ['Cashier Opening Checklist'] },
      })
      .mockResolvedValue({
        items: [{ item_label: 'Sanitize station', is_mandatory: 1 }],
        logName: null,
        logStatus: null,
      })

    const user = userEvent.setup()
    render(
      <OpeningChecklist
        user="captain@example.com"
        posProfile="POS-MAIN"
        branch="Main"
        onReady={onReady}
      />
    )

    // STATE 1: blocked -- no Start action, but a Recheck path.
    expect(
      await screen.findByText(/Cashier has not completed the Opening Checklist yet/)
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Recheck/i })
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Start Checklist/i })).toBeNull()

    await user.click(screen.getByRole('button', { name: /Recheck/i }))
    expect(
      await screen.findByRole('button', { name: /Start Checklist/i })
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('submits only after mandatory items have an explicit result', async () => {
    const onReady = vi.fn()
    fetchMock.mockResolvedValue({
      items: [
        { item_label: 'Sanitize station', is_mandatory: 1 },
        { item_label: 'Optional note', is_mandatory: 0 },
      ],
      logName: null,
      logStatus: null,
    })
    submitMock.mockResolvedValue({ status: 'Complete', name: 'LOG-2' })

    const user = userEvent.setup()
    render(
      <OpeningChecklist
        user="captain@example.com"
        posProfile="POS-MAIN"
        branch="Main"
        onReady={onReady}
      />
    )

    await startChecklist(user)
    const submit = await screen.findByRole('button', {
      name: /Submit checklist/i,
    })
    expect(submit).toBeDisabled()

    await user.click(screen.getAllByRole('radio')[0]) // PASS
    expect(submit).not.toBeDisabled()

    await user.click(submit)
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1))
    expect(submitMock).toHaveBeenCalledWith(
      'POS-MAIN',
      [
        {
          item_label: 'Sanitize station',
          status: 'Passed',
          remarks: '',
          goal: null,
        },
        {
          item_label: 'Optional note',
          status: undefined,
          remarks: '',
          goal: null,
        },
      ],
      undefined
    )
  })

  it('blocks submit when FAIL has no remarks', async () => {
    const onReady = vi.fn()
    fetchMock.mockResolvedValue({
      items: [{ item_label: 'Sanitize station', is_mandatory: 1 }],
      logName: null,
      logStatus: null,
    })
    submitMock.mockResolvedValue({ status: 'Complete', name: 'LOG-2' })

    const user = userEvent.setup()
    render(
      <OpeningChecklist
        user="captain@example.com"
        posProfile="POS-MAIN"
        branch="Main"
        onReady={onReady}
      />
    )

    await startChecklist(user)
    const submit = await screen.findByRole('button', {
      name: /Submit checklist/i,
    })
    await user.click(screen.getAllByRole('radio')[1]) // FAIL
    expect(submit).toBeDisabled()
    expect(
      await screen.findByText(/Remarks are required for failed items/i)
    ).toBeInTheDocument()
    expect(submitMock).not.toHaveBeenCalled()
  })

  it('shows Retry after empty auto-submit failure and retries successfully', async () => {
    const onReady = vi.fn()
    fetchMock.mockResolvedValue({
      items: [],
      logName: null,
      logStatus: null,
    })
    submitMock
      .mockResolvedValueOnce({ status: 'In Progress', name: 'LOG-3' })
      .mockResolvedValueOnce({ status: 'Complete', name: 'LOG-4' })

    const user = userEvent.setup()
    render(
      <OpeningChecklist
        user="captain@example.com"
        posProfile="POS-MAIN"
        onReady={onReady}
      />
    )

    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1))
    expect(onReady).not.toHaveBeenCalled()
    expect(await screen.findByText(/still incomplete/i)).toBeInTheDocument()

    const retry = screen.getByRole('button', { name: /^Retry$/i })
    expect(retry).not.toBeDisabled()
    await user.click(retry)

    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1))
  })

  it('does not fire stale onReady after posProfile changes', async () => {
    const onReady = vi.fn()
    let resolveFirst!: (value: {
      items: []
      logName: null
      logStatus: string
    }) => void

    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        })
    )
    fetchMock.mockResolvedValue({
      items: [{ item_label: 'Wipe counters', is_mandatory: 1 }],
      logName: null,
      logStatus: null,
    })

    const { rerender } = render(
      <OpeningChecklist
        user="captain@example.com"
        posProfile="POS-OLD"
        onReady={onReady}
      />
    )

    rerender(
      <OpeningChecklist
        user="captain@example.com"
        posProfile="POS-NEW"
        onReady={onReady}
      />
    )

    resolveFirst({
      items: [],
      logName: null,
      logStatus: 'Complete',
    })

    await startChecklist(
      // A fresh userEvent is fine here -- the assertion only needs the form
      // to appear for the NEW profile, proving the stale fetch was dropped.
      userEvent.setup()
    )
    await waitFor(() =>
      expect(screen.getByText(/Wipe counters/)).toBeInTheDocument()
    )
    expect(onReady).not.toHaveBeenCalled()
  })

  it('does not fire onReady after unmount while load is in flight', async () => {
    const onReady = vi.fn()
    let resolveFetch!: (value: {
      items: []
      logName: null
      logStatus: string
    }) => void

    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        })
    )

    const { unmount } = render(
      <OpeningChecklist
        user="captain@example.com"
        posProfile="POS-MAIN"
        onReady={onReady}
      />
    )

    unmount()
    resolveFetch({ items: [], logName: null, logStatus: 'Complete' })
    await Promise.resolve()
    expect(onReady).not.toHaveBeenCalled()
  })
})
