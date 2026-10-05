import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OpeningChecklist } from '../components/OpeningChecklist'
import * as checklistApi from '../api/checklist'

vi.mock('../api/checklist', async (importOriginal) => {
  const actual = await importOriginal<typeof checklistApi>()
  return { ...actual, fetchOpeningChecklist: vi.fn(), submitOpeningChecklist: vi.fn() }
})

const fetchMock = checklistApi.fetchOpeningChecklist as ReturnType<typeof vi.fn>
const submitMock = checklistApi.submitOpeningChecklist as ReturnType<typeof vi.fn>

describe('OpeningChecklist failed-objective submission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submitting with a FAIL objective completes the gate (FAIL is valid)', async () => {
    const onReady = vi.fn()
    fetchMock.mockResolvedValue({
      items: [{ item_label: 'Check kitchen readiness', is_mandatory: 1, status: null }],
      logName: null,
      logStatus: null,
      blockedBy: null,
    })
    submitMock.mockResolvedValue({ status: 'Complete', name: 'LOG-8' })

    const user = userEvent.setup()
    render(
      <OpeningChecklist
        user="ot@example.com"
        posProfile="URY"
        branch="URY"
        onReady={onReady}
      />
    )

    // answer FAIL + remark and submit
    await user.click((await screen.findAllByRole('radio'))[1])
    await user.type(await screen.findByPlaceholderText(/Explain the failure/), 'test')
    await user.click(screen.getByRole('button', { name: /Submit checklist/i }))

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1))
    // no error, no failed-items message anywhere
    expect(screen.queryByText(/Complete all mandatory/i)).toBeNull()
    expect(screen.queryByText(/submitted with failed items/i)).toBeNull()
  })

  it('submitting with all PASS completes the gate', async () => {
    const onReady = vi.fn()
    fetchMock
      .mockResolvedValueOnce({
        items: [{ item_label: 'Check kitchen readiness', is_mandatory: 1, status: 'Failed', remarks: 'test' }],
        logName: null,
        logStatus: null,
        blockedBy: null,
      })
      .mockResolvedValue({
        items: [],
        logName: null,
        logStatus: 'Complete',
        blockedBy: null,
      })
    submitMock.mockResolvedValue({ status: 'Complete', name: 'LOG-9' })

    const user = userEvent.setup()
    render(
      <OpeningChecklist
        user="ot@example.com"
        posProfile="URY"
        branch="URY"
        onReady={onReady}
      />
    )

    // prefilled FAIL + remark; flip to PASS and submit
    const radios = await screen.findAllByRole('radio')
    expect((radios[1] as HTMLInputElement).checked).toBe(true)
    await user.click(radios[0])
    await user.click(screen.getByRole('button', { name: /Submit checklist/i }))

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1))
  })
})
