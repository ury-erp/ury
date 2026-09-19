import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Input } from '@ury/ui';
import { t } from '../../i18n';

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
  disabled?: boolean;
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
  disabled = false,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  // -1 means "nothing highlighted": the list opens with no pre-selection so
  // Enter cannot commit an option the user never looked at.
  const [activeIndex, setActiveIndex] = useState(-1);
  const [portalStyle, setPortalStyle] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight?: number;
  }>({
    top: 0,
    left: 0,
    width: 0,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Find label of selected value
  const selectedOption = useMemo(() => {
    if (!value) return null;
    const valLower = value.toLowerCase();
    return options.find(
      (opt) =>
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

  // Position dropdown panel directly below trigger (opening DOWNWARD) with compact maxHeight
  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const gap = 6;
      const boundaryMargin = 16;
      const spaceBelow = window.innerHeight - rect.bottom - gap - boundaryMargin;
      const compactMaxHeight = 260; // Compact max height showing ~8 options cleanly

      setPortalStyle({
        top: rect.bottom + gap,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.min(compactMaxHeight, Math.max(120, spaceBelow)),
      });
    };

    updatePosition();

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
        setIsTyping(false);
        if (strict) {
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
  };

  useEffect(() => {
    setActiveIndex(-1);
  }, [searchTerm, isOpen]);

  /**
   * Keyboard control for the list.
   *
   * The field was mouse-only: no key handler at all, so a form containing one
   * could not be completed from the keyboard, and nothing announced that the
   * input controlled a list (UX-17). Arrow keys move the highlight, Enter
   * commits it, Escape closes without committing, Home/End jump the ends.
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      if (filteredOptions.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((prev) => {
        const next = prev + step;
        if (next < 0) return filteredOptions.length - 1;
        if (next >= filteredOptions.length) return 0;
        return next;
      });
      return;
    }

    if (e.key === 'Home' || e.key === 'End') {
      if (!isOpen || filteredOptions.length === 0) return;
      e.preventDefault();
      setActiveIndex(e.key === 'Home' ? 0 : filteredOptions.length - 1);
      return;
    }

    if (e.key === 'Enter') {
      if (isOpen && activeIndex >= 0 && activeIndex < filteredOptions.length) {
        // Only swallow Enter when it is actually committing a highlighted
        // option; otherwise the surrounding form keeps its submit behaviour.
        e.preventDefault();
        handleSelectOption(filteredOptions[activeIndex]);
      }
      return;
    }

    if (e.key === 'Escape') {
      if (isOpen) {
        e.preventDefault();
        setIsOpen(false);
        setActiveIndex(-1);
      }
    }
  };

  const handleSelectOption = (opt: Option) => {
    onChange(id, opt.value);
    setSearchTerm(opt.label);
    setIsTyping(false);
    setIsOpen(false);
    setActiveIndex(-1);
    onBlur?.(id);
  };

  const handleFocus = () => {
    if (!disabled) {
      setIsOpen(true);
    }
  };

  const dropdownContent = (isOpen && !disabled) ? (
    <div
      ref={dropdownRef}
      role="listbox"
      id={`${id}-listbox`}
      style={{
        position: 'fixed',
        top: `${portalStyle.top}px`,
        left: `${portalStyle.left}px`,
        width: `${portalStyle.width}px`,
        maxHeight: portalStyle.maxHeight ? `${portalStyle.maxHeight}px` : undefined,
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}
      className="z-[9999] bg-white border border-gray-200 rounded-lg shadow-xl overflow-y-auto p-1 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      {filteredOptions.length > 0 ? (
        filteredOptions.map((opt, optIndex) => {
          const isActionOption =
            opt.value === 'CREATE_NEW_ITEM' ||
            opt.value === 'CREATE_NEW_COURSE' ||
            opt.value?.startsWith('CREATE_NEW_') ||
            opt.value?.startsWith('ADD_ANOTHER_');
          const isSelected =
            value !== undefined &&
            value !== null &&
            !isActionOption &&
            (opt.value === value ||
              opt.label === value ||
              (opt.value !== '' && opt.value && value !== '' && value && opt.value.toLowerCase() === value.toLowerCase()) ||
              (opt.label !== '' && opt.label && value !== '' && value && opt.label.toLowerCase() === value.toLowerCase()));

          const isActive = optIndex === activeIndex;

          return (
            <div
              key={opt.value}
              id={`${id}-option-${optIndex}`}
              role="option"
              aria-selected={isSelected}
              onClick={() => handleSelectOption(opt)}
              onMouseEnter={() => setActiveIndex(optIndex)}
              className={`px-4 py-2 text-sm rounded-md cursor-pointer select-none transition-colors ${
                isActive
                  ? 'bg-blue-100 text-blue-900'
                  : isSelected
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
        <div className="px-4 py-2 text-sm text-gray-400">{t('dash.searchable_select.no_matching_options')}</div>
      )}
    </div>
  ) : null;

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <Input
          id={id}
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={isOpen && !disabled}
          aria-controls={`${id}-listbox`}
          aria-autocomplete="list"
          aria-activedescendant={
            isOpen && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined
          }
          placeholder={placeholder}
          error={error}
          disabled={disabled}
          autoComplete="off"
          className="w-full pe-9 cursor-text"
        />
        <div
          onClick={() => {
            if (!disabled) {
              setIsOpen((prev) => !prev);
              if (!isOpen) setIsTyping(false);
            }
          }}
          className={`absolute end-3 top-1/2 -translate-y-1/2 text-gray-400 p-1 transition-colors ${
            disabled ? 'pointer-events-none opacity-50' : 'cursor-pointer hover:text-gray-600'
          }`}
        >
          <svg
            className={`w-4 h-4 transform transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {typeof document !== 'undefined' && createPortal(dropdownContent, document.body)}
    </div>
  );
}
