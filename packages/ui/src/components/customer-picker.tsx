import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Loader, Phone, UserPlus } from 'lucide-react'
import { Button } from './button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './dialog'
import { Input } from './input'
import { cn } from '../lib/cn'

export interface CustomerOption {
  id: string
  name: string
  phone: string
}

export interface CustomerPickerLabels {
  placeholder: string
  addNew: string
  nameLabel: string
  phoneLabel: string
  addButton: string
  adding: string
  /** Create-dialog cancel button. */
  cancel: string
  /**
   * Clear/change button when a customer is selected.
   * Defaults to `cancel` for backward compatibility.
   */
  changeLabel?: string
  noResults: string
  /** API search failure copy. Defaults to `noResults` when omitted. */
  searchFailed?: string
  searching: string
  createTitle: string
}

export interface CustomerPickerProps {
  value: CustomerOption | null
  onChange: (customer: CustomerOption | null) => void
  results: CustomerOption[]
  searching?: boolean
  searchError?: string | null
  onSearch: (query: string) => void
  onCreate: (data: { name: string; phone: string }) => Promise<CustomerOption>
  disabled?: boolean
  labels: CustomerPickerLabels
  favourites?: Array<{ name: string; onSelect: () => void }>
}

function prefillFromQuery(query: string): { name: string; phone: string } {
  const trimmed = query.trim()
  if (/^\d+$/.test(trimmed)) return { name: '', phone: trimmed }
  return { name: trimmed, phone: '' }
}

export function CustomerPicker({
  value,
  onChange,
  results,
  searching = false,
  searchError = null,
  onSearch,
  onCreate,
  disabled,
  labels,
  favourites,
}: CustomerPickerProps) {
  const [query, setQuery] = useState('')
  const [listOpen, setListOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const onSearchRef = useRef(onSearch)
  onSearchRef.current = onSearch

  const changeLabel = labels.changeLabel ?? labels.cancel
  const searchFailedLabel = labels.searchFailed ?? labels.noResults
  // Add-new row sits after results in the keyboard list.
  const addNewIndex = results.length

  useEffect(() => {
    const timer = window.setTimeout(() => onSearchRef.current(query), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    setHighlightedIndex(0)
  }, [results, query])

  const openCreate = (fromQuery = query) => {
    const prefill = prefillFromQuery(fromQuery)
    setName(prefill.name)
    setPhone(prefill.phone)
    setError('')
    setCreateOpen(true)
    setListOpen(false)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !phone.trim()) return
    setCreating(true)
    setError('')
    try {
      const created = await onCreate({ name: name.trim(), phone: phone.trim() })
      onChange(created)
      setCreateOpen(false)
      setName('')
      setPhone('')
      setQuery('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create customer')
    } finally {
      setCreating(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!listOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setListOpen(true)
      setHighlightedIndex(0)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) => Math.min(prev + 1, addNewIndex))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && listOpen) {
      e.preventDefault()
      if (highlightedIndex === addNewIndex) {
        openCreate()
      } else if (results[highlightedIndex]) {
        onChange(results[highlightedIndex])
        setQuery('')
        setListOpen(false)
      }
    } else if (e.key === 'Escape') {
      setListOpen(false)
    }
  }

  return (
    <div className="relative space-y-2">
      {value ? (
        <div className="flex items-center justify-between rounded-lg border border-border bg-white px-3 py-2">
          <div>
            <p className="text-sm font-medium text-gray-900">{value.name}</p>
            <p className="text-xs text-gray-500">{value.phone}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(null)}>
            {changeLabel}
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setListOpen(true)
              setHighlightedIndex(0)
            }}
            onFocus={() => setListOpen(true)}
            onBlur={() => window.setTimeout(() => setListOpen(false), 100)}
            onKeyDown={handleKeyDown}
            placeholder={labels.placeholder}
            variant="search"
            disabled={disabled}
            autoComplete="off"
            className="pr-9"
          />
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          {listOpen && (
            <div className="absolute z-50 mt-2 max-h-80 w-full overflow-y-auto rounded-lg border border-border bg-white shadow-lg">
              {searching && (
                <div className="flex items-center justify-center p-4 text-sm text-gray-500">
                  <Loader className="me-2 h-4 w-4 animate-spin" />
                  {labels.searching}
                </div>
              )}
              {searchError && !searching && (
                <div className="p-4 text-center text-sm text-destructive">{searchError || searchFailedLabel}</div>
              )}
              {!searching && !searchError && query.trim() && results.length === 0 && (
                <p className="p-4 text-center text-xs text-gray-500">{labels.noResults}</p>
              )}
              {!searching &&
                results.map((customer, idx) => (
                  <Button
                    key={customer.id}
                    type="button"
                    variant="ghost"
                    className={cn(
                      'h-auto w-full justify-start rounded-none px-4 py-2',
                      idx === highlightedIndex && 'bg-primary-50 text-primary-700'
                    )}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      onChange(customer)
                      setQuery('')
                      setListOpen(false)
                    }}
                  >
                    <div className="text-left">
                      <div className="font-medium">{customer.name}</div>
                      <div className="text-xs text-gray-500">{customer.phone}</div>
                    </div>
                  </Button>
                ))}
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  'w-full justify-start rounded-none',
                  highlightedIndex === addNewIndex && 'bg-primary-50 text-primary-700'
                )}
                onMouseDown={(e) => {
                  e.preventDefault()
                  openCreate()
                }}
              >
                <UserPlus className="me-2 h-4 w-4" />
                {labels.addNew}
              </Button>
            </div>
          )}
        </div>
      )}

      {favourites && favourites.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {favourites.map((fav) => (
            <Button key={fav.name} type="button" variant="secondary" size="sm" onClick={fav.onSelect}>
              {fav.name}
            </Button>
          ))}
        </div>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={(next) => {
          if (creating) return
          setCreateOpen(next)
        }}
      >
        <DialogContent onClose={() => !creating && setCreateOpen(false)}>
          <DialogHeader>
            <DialogTitle>{labels.createTitle}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4 px-6 pb-6" onSubmit={handleCreate}>
            {error && (
              <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="ury-cust-name">
                {labels.nameLabel}
              </label>
              <Input
                id="ury-cust-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={creating}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="ury-cust-phone">
                {labels.phoneLabel}
              </label>
              <div className="relative">
                <Input
                  id="ury-cust-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  disabled={creating}
                  className="pl-10"
                />
                <Phone className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
              </div>
            </div>
            <div className="flex gap-3">
              <Button type="submit" className="flex-1" disabled={creating}>
                {creating ? (
                  <>
                    <Loader className="me-2 h-4 w-4 animate-spin" />
                    {labels.adding}
                  </>
                ) : (
                  labels.addButton
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
              >
                {labels.cancel}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
