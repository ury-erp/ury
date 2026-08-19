import { useEffect, useState } from 'react'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

/**
 * Debounced search input component with instant visual feedback.
 *
 * - Local state provides instant typing feedback
 * - onChange is called only after debounce delay (250-300ms) settles
 * - Includes inline SVG icons (search and clear button)
 * - No external icon library dependency
 */
function SearchBar({ value, onChange, placeholder = 'Search menu...' }: SearchBarProps) {
  const [localValue, setLocalValue] = useState(value)

  // Update local state when parent value changes
  useEffect(() => {
    setLocalValue(value)
  }, [value])

  // Debounce onChange when local value changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localValue !== value) {
        onChange(localValue)
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [localValue, value, onChange])

  function handleClear() {
    setLocalValue('')
    onChange('')
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2">
        {/* Search Icon */}
        <svg
          className="h-5 w-5 flex-shrink-0 text-muted-foreground"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>

        {/* Input */}
        <input
          type="text"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          placeholder={placeholder}
          className="flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Search menu"
        />

        {/* Clear Button */}
        {localValue && (
          <button
            onClick={handleClear}
            className="flex-shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Clear search"
            type="button"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6l-12 12M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

export default SearchBar
