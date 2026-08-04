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
}

export function SearchableSelect({
  id,
  value,
  options = [],
  placeholder = 'Select...',
  error,
  onChange,
  onBlur,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Find label of selected value
  const selectedOption = useMemo(() => {
    return options.find((opt) => opt.value === value || opt.label === value);
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
        setSearchTerm(selectedOption ? selectedOption.label : value || '');
        onBlur?.(id);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [id, value, selectedOption, onBlur]);

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
    } else {
      onChange(id, val);
    }
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
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto py-1 focus:outline-none">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt) => (
              <div
                key={opt.value}
                onClick={() => handleSelectOption(opt)}
                className={`px-4 py-2 text-sm cursor-pointer select-none transition-colors ${
                  opt.value === value || opt.label === value
                    ? 'bg-blue-50 text-blue-600 font-medium'
                    : 'text-gray-800 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </div>
            ))
          ) : (
            <div className="px-4 py-2 text-sm text-gray-400">No matching options</div>
          )}
        </div>
      )}
    </div>
  );
}
