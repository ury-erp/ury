import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronDown, Check } from 'lucide-react';
import { Badge } from '@ury/ui';

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  id?: string;
  values: string[];
  options: MultiSelectOption[];
  placeholder?: string;
  onChange: (values: string[]) => void;
  disabled?: boolean;
}

export function MultiSelect({
  id,
  values = [],
  options = [],
  placeholder = 'Select roles...',
  onChange,
  disabled = false,
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
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

  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) return options;
    const term = searchTerm.toLowerCase();
    return options.filter(
      (opt) => opt.label.toLowerCase().includes(term) || opt.value.toLowerCase().includes(term)
    );
  }, [options, searchTerm]);

  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const gap = 6;
      const boundaryMargin = 16;
      const spaceBelow = window.innerHeight - rect.bottom - gap - boundaryMargin;
      const compactMaxHeight = 240;

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
        setSearchTerm('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleToggleOption = (value: string) => {
    if (values.includes(value)) {
      onChange(values.filter((v) => v !== value));
    } else {
      onChange([...values, value]);
    }
  };

  const handleRemoveValue = (e: React.MouseEvent, value: string) => {
    e.stopPropagation();
    if (disabled) return;
    onChange(values.filter((v) => v !== value));
  };

  const selectedOptions = useMemo(() => {
    return options.filter((opt) => values.includes(opt.value));
  }, [options, values]);

  const dropdownContent = isOpen && !disabled ? (
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: `${portalStyle.top}px`,
        left: `${portalStyle.left}px`,
        width: `${portalStyle.width}px`,
        maxHeight: portalStyle.maxHeight ? `${portalStyle.maxHeight}px` : undefined,
      }}
      className="z-[9999] bg-white border border-gray-200 rounded-lg shadow-xl overflow-y-auto p-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20"
    >
      {options.length > 5 && (
        <div className="p-1 mb-1 border-b border-gray-100">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter roles..."
            className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-primary"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      {filteredOptions.length > 0 ? (
        filteredOptions.map((opt) => {
          const isSelected = values.includes(opt.value);
          return (
            <div
              key={opt.value}
              onClick={() => handleToggleOption(opt.value)}
              className={`flex items-center justify-between px-3 py-2 text-sm rounded-md cursor-pointer select-none transition-colors ${
                isSelected
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span>{opt.label}</span>
              {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
            </div>
          );
        })
      ) : (
        <div className="px-3 py-2 text-sm text-gray-400">No matching options</div>
      )}
    </div>
  ) : null;

  return (
    <div ref={containerRef} className="relative w-full" id={id}>
      <div
        onClick={() => {
          if (!disabled) setIsOpen((prev) => !prev);
        }}
        className={`min-h-[40px] w-full flex items-center justify-between gap-2 px-3 py-1.5 bg-white border rounded-md cursor-pointer transition-all ${
          isOpen ? 'border-primary ring-2 ring-primary/20' : 'border-gray-300 hover:border-gray-400'
        } ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : ''}`}
      >
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
          {selectedOptions.length > 0 ? (
            selectedOptions.map((opt) => (
              <Badge
                key={opt.value}
                variant="outline"
                className="bg-primary/10 border-primary/30 text-primary text-xs flex items-center gap-1 py-0.5 px-2"
              >
                <span>{opt.label}</span>
                <span
                  onClick={(e) => handleRemoveValue(e, opt.value)}
                  className="hover:bg-primary/20 rounded-full p-0.5 transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </span>
              </Badge>
            ))
          ) : (
            <span className="text-gray-400 text-sm">{placeholder}</span>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${
            isOpen ? 'rotate-180 text-primary' : ''
          }`}
        />
      </div>

      {typeof document !== 'undefined' && createPortal(dropdownContent, document.body)}
    </div>
  );
}

export default MultiSelect;
