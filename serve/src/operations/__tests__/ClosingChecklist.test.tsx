import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClosingChecklist } from '../components/OpeningChecklist'
import * as checklistApi from '../api/checklist'

vi.mock('../api/checklist', async (importOriginal) => {
  const actual = await importOriginal<typeof checklistApi>()
  return {
    ...actual,
    fetchOpeningChecklist: vi.fn(),
    submitOpeningChecklist: vi.fn(),
    fetchClosingChecklist: vi.fn(),
    submitClosingChecklist: vi.fn(),
  }
})

const fetchMock = checklistApi.fetchClosingChecklist as ReturnType<typeof vi.fn>
const submitMock = checklistApi.submitClosingChecklist as ReturnType<typeof vi.fn>

const identity = { user: 'ot@example.com', posProfile: 'URY', branch: 'URY' }

describe('ClosingChecklist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the Closing checklist and submits FAIL + remark without blocking', async () => {
    const onClose = vi.fn()
    fetchMock.mockResolvedValue({
      items: [
        { item_label: 'Clear all tables', is_mandatory: 1, status: null },
        { item_label: 'Printer paper stocked', is_mandatory: 1, status: null },
      ],
      logName: null,
      logStatus: null,
      blockedBy: null,
    })
    submitMock.mockResolvedValue({ status: 'Complete', name: 'LOG-C1' })

    const user = userEvent.setup()
    render(<ClosingChecklist {...identity} onClose={onClose} />)

    expect(await screen.findByText('Closing checklist')).toBeInTheDocument()

    // Objective 1 -> PASS, objective 2 -> FAIL + remark.
    const radios = await screen.findAllByRole('radio')
    await user.click(radios[0])
    await user.click(radios[3])
    await user.type(
      await screen.findByPlaceholderText(/Explain the failure/),
      'Printer issue'
    )
    await user.click(screen.getByRole('button', { name: /Submit checklist/i }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(submitMock).toHaveBeenCalledWith('URY', [
      {
        item_label: 'Clear all tables',
        status: 'Passed',
        remarks: '',
        goal: null,
      },
      {
        item_label: 'Printer paper stocked',
        status: 'Failed',
        remarks: 'Printer issue',
        goal: null,
      },
    ])
    // FAIL never surfaces a blocker or incomplete notice.
    expect(screen.queryByText(/Complete all mandatory/i)).toBeNull()
    expect(screen.queryByText(/submitted with failed items/i)).toBeNull()
  })

  it('blocks with the predecessor message when the backend reports blocked_by', async () => {
    const onClose = vi.fn()
    fetchMock.mockResolvedValue({
      items: [],
      logName: null,
      logStatus: null,
      blockedBy: { role: 'Order Taker', role_label: 'Order Taker', goals: [] },
    })

    const user = userEvent.setup()
    render(<ClosingChecklist {...identity} onClose={onClose} />)

    expect(
      await screen.findByText(
        /Order Taker has not completed the Closing Checklist yet/
      )
    ).toBeInTheDocument()
    // Blocked gate: no items and no way to submit.
    expect(screen.queryByRole('radio')).toBeNull()
    expect(
      screen.getByRole('button', { name: /Submit checklist/i })
    ).toBeDisabled()
    // Dismissible: the user can close the dialog.
    await user.click(screen.getAllByRole('button', { name: /^Close$/i })[0])
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows an already-completed state instead of resubmitting', async () => {
    const onClose = vi.fn()
    fetchMock.mockResolvedValue({
      items: [],
      logName: 'LOG-C2',
      logStatus: 'Complete',
      blockedBy: null,
    })

    render(<ClosingChecklist {...identity} onClose={onClose} />)

    expect(
      await screen.findByText(/already been submitted for this business day/i)
    ).toBeInTheDocument()
    expect(submitMock).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes via the header close button without submitting', async () => {
    const onClose = vi.fn()
    fetchMock.mockResolvedValue({
      items: [{ item_label: 'Clear all tables', is_mandatory: 1, status: null }],
      logName: null,
      logStatus: null,
      blockedBy: null,
    })

    const user = userEvent.setup()
    render(<ClosingChecklist {...identity} onClose={onClose} />)

    await user.click(await screen.findByRole('button', { name: /^Close$/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(submitMock).not.toHaveBeenCalled()
  })
})
