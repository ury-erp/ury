import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Loader } from 'lucide-react'
import { Input } from './input'
import { cn } from '../lib/cn'

export interface AutocompleteOption {
  value: string
  label: string
  description?: string
}

export interface AutocompleteProps {
  id?: string
  value: string
  onChange: (value: string) => void
  /**
   * Fired after `debounceMs` whenever the query changes, and (when
   * `searchOnFocus` is true) once on open with an empty query so the parent
   * can load an initial page of results from the backend.
   */
  onSearch: (query: string) => void
  options: AutocompleteOption[]
  searching?: boolean
  placeholder?: string
  disabled?: boolean
  error?: boolean
  /** Debounce for `onSearch`. Defaults to 300ms. */
  debounceMs?: number
  /**
   * When true (default), only values present in `options` are committed.
   * Typed text that does not match an option stays in the input until the
   * user picks a real result.
   */
  strict?: boolean
  /** Fire `onSearch('')` when the field opens. Defaults to true. */
  searchOnFocus?: boolean
  noResultsLabel?: string
  searchingLabel?: string
  className?: string
  onBlur?: () => void
}

export function Autocomplete({
  id,
  value,
  onChange,
  onSearch,
  options,
  searching = false,
  placeholder = 'Search…',
  disabled = false,
  error = false,
  debounceMs = 300,
  strict = true,
  searchOnFocus = true,
  noResultsLabel = 'No matching options',
  searchingLabel = 'Searching…',
  className,
  onBlur,
}: AutocompleteProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const listboxId = `${inputId}-listbox`

  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [portalStyle, setPortalStyle] = useState<{
    top: number
    left: number
    width: number
    maxHeight: number
  }>({ top: 0, left: 0, width: 0, maxHeight: 260 })

  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const onSearchRef = useRef(onSearch)
  onSearchRef.current = onSearch

  const selectedOption = options.find(
    (opt) =>
      opt.value.toLowerCase() === value.toLowerCase() ||
      opt.label.toLowerCase() === value.toLowerCase()
  )
  const displayValue = isTyping ? query : selectedOption?.label ?? value ?? ''

  // Keep the closed input in sync with the committed value.
  useEffect(() => {
    if (!isTyping) {
      setQuery(selectedOption?.label ?? value ?? '')
    }
  }, [value, selectedOption?.label, isTyping])

  // Debounced search while open.
  useEffect(() => {
    if (!isOpen || disabled) return
    const timer = window.setTimeout(() => {
      onSearchRef.current(isTyping ? query : '')
    }, debounceMs)
    return () => window.clearTimeout(timer)
  }, [query, isTyping, isOpen, disabled, debounceMs])

  useEffect(() => {
    setHighlightedIndex(0)
  }, [options, query])

  useEffect(() => {
    if (!isOpen) return

    const updatePosition = () => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const gap = 6
      const boundaryMargin = 16
      const spaceBelow = window.innerHeight - rect.bottom - gap - boundaryMargin
      setPortalStyle({
        top: rect.bottom + gap,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.min(260, Math.max(120, spaceBelow)),
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        containerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return
      }
      closeList(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, selectedOption, value, strict])

  const closeList = (commitBlur: boolean) => {
    setIsOpen(false)
    setIsTyping(false)
    setQuery(selectedOption?.label ?? (strict ? value || '' : value || ''))
    if (commitBlur) onBlur?.()
  }

  const selectOption = (opt: AutocompleteOption) => {
    onChange(opt.value)
    setQuery(opt.label)
    setIsTyping(false)
    setIsOpen(false)
    onBlur?.()
  }

  const openList = () => {
    if (disabled) return
    setIsOpen(true)
    if (searchOnFocus && !isTyping) {
      // Immediate first fetch so the list is not empty for a debounce tick.
      onSearchRef.current('')
    }
  }

  const handleInputChange = (next: string) => {
    setQuery(next)
    setIsTyping(true)
    setIsOpen(true)

    const matched = options.find(
      (opt) =>
        opt.label.toLowerCase() === next.toLowerCase() ||
        opt.value.toLowerCase() === next.toLowerCase()
    )
    if (matched) {
      onChange(matched.value)
    } else if (!strict) {
      onChange(next)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      openList()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) => Math.min(prev + 1, Math.max(options.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && isOpen && options[highlightedIndex]) {
      e.preventDefault()
      selectOption(options[highlightedIndex])
    } else if (e.key === 'Escape') {
      closeList(false)
    }
  }

  const dropdown =
    isOpen && !disabled
      ? createPortal(
          <div
            ref={dropdownRef}
            id={listboxId}
            role="listbox"
            style={{
              position: 'fixed',
              top: portalStyle.top,
              left: portalStyle.left,
              width: portalStyle.width,
              maxHeight: portalStyle.maxHeight,
            }}
            className="z-[9999] overflow-y-auto rounded-lg border border-border bg-white p-1 shadow-xl"
          >
            {searching && (
              <div className="flex items-center justify-center gap-2 px-4 py-3 text-sm text-text-tertiary">
                <Loader className="h-4 w-4 animate-spin" />
                {searchingLabel}
              </div>
            )}
            {!searching && options.length === 0 && (
              <div className="px-4 py-2 text-sm text-text-tertiary">{noResultsLabel}</div>
            )}
            {!searching &&
              options.map((opt, idx) => {
                const isSelected =
                  !!value &&
                  (opt.value === value ||
                    opt.label === value ||
                    opt.value.toLowerCase() === value.toLowerCase())
                const isHighlighted = idx === highlightedIndex
                return (
                  <div
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      selectOption(opt)
                    }}
                    className={cn(
                      'cursor-pointer select-none rounded-md px-4 py-2 text-sm transition-colors',
                      isHighlighted || isSelected
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-foreground hover:bg-muted'
                    )}
                  >
                    <div>{opt.label}</div>
                    {opt.description ? (
                      <div className="text-xs text-text-tertiary">{opt.description}</div>
                    ) : null}
                  </div>
                )
              })}
          </div>,
          document.body
        )
      : null

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <div className="relative flex items-center">
        <Input
          id={inputId}
          value={displayValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={openList}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          error={error}
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          className="w-full pr-9 cursor-text"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Toggle options"
          disabled={disabled}
          onClick={() => {
            if (isOpen) closeList(false)
            else openList()
          }}
          className={cn(
            'absolute right-3 top-1/2 -translate-y-1/2 p-1 text-text-tertiary transition-colors',
            disabled ? 'pointer-events-none opacity-50' : 'hover:text-foreground'
          )}
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
        </button>
      </div>
      {dropdown}
    </div>
  )
}
