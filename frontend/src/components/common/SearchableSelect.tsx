import { useState, useRef, useEffect, useMemo } from 'react';
import { Input } from '@ury/ui';

export interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  id: string;
  value: string;
  options: Option[];
  placeholder?: string;
  error?: boolean;
  onChange: (id: string, value: string) => void;
  onBlur?: (id: string) => void;
  /**
   * When true, only values matching an option in `options` are ever
   * propagated via `onChange`. Typed text that doesn't match any option is
   * still shown in the input, but is not committed to form state until the
   * user selects a real option. Defaults to `false` to preserve free-text
   * behavior for existing consumers (Dashboard pages, Menu course field).
   */
  strict?: boolean;
}

export function SearchableSelect({
  id,
  value,
  options = [],
  placeholder = 'Select...',
  error,
  onChange,
  onBlur,
  strict = false,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Find label of selected value
  const selectedOption = useMemo(() => {
    if (!value) return null;
    const valLower = value.toLowerCase();
    return options.find((opt) => 
      (opt.value && opt.value.toLowerCase() === valLower) || 
      (opt.label && opt.label.toLowerCase() === valLower)
    );
  }, [options, value]);

  // Sync display text when value or options change
  useEffect(() => {
    if (!isTyping) {
      setSearchTerm(selectedOption ? selectedOption.label : value || '');
    }
  }, [value, selectedOption, isTyping]);

  // Filter options: if user is typing, filter by searchTerm; otherwise return all options
  const filteredOptions = useMemo(() => {
    if (!isTyping || !searchTerm) return options;
    const term = searchTerm.toLowerCase();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(term) ||
        opt.value.toLowerCase().includes(term)
    );
  }, [options, searchTerm, isTyping]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsTyping(false);
        if (strict) {
          // Revert any unmatched typed text back to the last valid
          // selection rather than leaving an invalid string displayed.
          setSearchTerm(selectedOption ? selectedOption.label : '');
        } else {
          setSearchTerm(selectedOption ? selectedOption.label : value || '');
        }
        onBlur?.(id);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [id, value, selectedOption, onBlur, strict]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchTerm(val);
    setIsTyping(true);
    setIsOpen(true);

    const matched = options.find(
      (opt) => opt.label.toLowerCase() === val.toLowerCase() || opt.value.toLowerCase() === val.toLowerCase()
    );
    if (matched) {
      onChange(id, matched.value);
    } else if (!strict) {
      onChange(id, val);
    }
    // strict mode: leave the typed text visible in `searchTerm` (state
    // above) without propagating it via onChange until a real option is
    // selected — the last valid committed value stays in form state.
  };

  const handleSelectOption = (opt: Option) => {
    onChange(id, opt.value);
    setSearchTerm(opt.label);
    setIsTyping(false);
    setIsOpen(false);
    onBlur?.(id);
  };

  const handleFocus = () => {
    setIsOpen(true);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <Input
          id={id}
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={handleFocus}
          placeholder={placeholder}
          error={error}
          autoComplete="off"
          className="w-full pr-9 cursor-text"
        />
        <div 
          onClick={() => {
            setIsOpen((prev) => !prev);
            if (!isOpen) setIsTyping(false);
          }} 
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 cursor-pointer p-1 hover:text-gray-600 transition-colors"
        >
          <svg className={`w-4 h-4 transform transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto p-1 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt) => {
              const isActionOption = opt.value === 'CREATE_NEW_ITEM' || opt.value === 'CREATE_NEW_COURSE' || opt.value?.startsWith('CREATE_NEW_');
              const isSelected = value !== undefined && value !== null && !isActionOption && (
                opt.value === value || 
                opt.label === value || 
                (opt.value !== '' && opt.value && value !== '' && value && opt.value.toLowerCase() === value.toLowerCase()) || 
                (opt.label !== '' && opt.label && value !== '' && value && opt.label.toLowerCase() === value.toLowerCase())
              );

              return (
                <div
                  key={opt.value}
                  onClick={() => handleSelectOption(opt)}
                  className={`px-4 py-2 text-sm rounded-md cursor-pointer select-none transition-colors ${
                    isSelected
                      ? 'bg-blue-50 text-blue-700 font-normal'
                      : isActionOption
                      ? 'text-blue-600 font-medium hover:bg-blue-50/50 border-t border-gray-100 mt-1 pt-2'
                      : 'text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </div>
              );
            })
          ) : (
            <div className="px-4 py-2 text-sm text-gray-400">No matching options</div>
          )}
        </div>
      )}
    </div>
  );
}
