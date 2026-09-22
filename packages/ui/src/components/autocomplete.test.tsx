import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as React from 'react'
import { Autocomplete, type AutocompleteOption } from './autocomplete'

function Harness({
  onSearch = vi.fn(),
  initial = '',
  options = [] as AutocompleteOption[],
  searching = false,
}: {
  onSearch?: (query: string) => void
  initial?: string
  options?: AutocompleteOption[]
  searching?: boolean
}) {
  const [value, setValue] = React.useState(initial)
  return (
    <Autocomplete
      id="bom"
      value={value}
      onChange={setValue}
      onSearch={onSearch}
      options={options}
      searching={searching}
      placeholder="Select BOM"
      debounceMs={300}
    />
  )
}

describe('Autocomplete', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces onSearch and fires empty query on focus', async () => {
    const onSearch = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<Harness onSearch={onSearch} />)

    await user.click(screen.getByPlaceholderText('Select BOM'))
    expect(onSearch).toHaveBeenCalledWith('')

    onSearch.mockClear()
    await user.type(screen.getByPlaceholderText('Select BOM'), 'BOM-')

    expect(onSearch).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    await waitFor(() => {
      expect(onSearch).toHaveBeenCalledWith('BOM-')
    })
  })

  it('commits a selected option value', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <Harness
        options={[
          { value: 'BOM-001', label: 'BOM-001' },
          { value: 'BOM-002', label: 'BOM-002 — Caesar' },
        ]}
      />
    )

    await user.click(screen.getByPlaceholderText('Select BOM'))
    await user.click(screen.getByRole('option', { name: /BOM-002/ }))

    expect(screen.getByDisplayValue('BOM-002 — Caesar')).toBeInTheDocument()
  })

  it('shows searching state', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<Harness searching options={[]} />)

    await user.click(screen.getByPlaceholderText('Select BOM'))
    expect(screen.getByText('Searching…')).toBeInTheDocument()
  })
})
