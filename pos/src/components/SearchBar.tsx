import React, { useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onVisibilityChange: (isVisible: boolean) => void;
  isVisible: boolean;
  disabled?: boolean;
}

export default function SearchBar({
  value,
  onChange,
  onVisibilityChange,
  isVisible,
  disabled
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isVisible && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isVisible]);

  return (
    <div className="flex items-center">
      <button
        onClick={() => onVisibilityChange(true)}
        className={cn(
          'h-9 flex items-center gap-2 px-3 rounded-full text-sm font-medium transition-all duration-200 ease-in-out hover:scale-105 active:scale-95',
          isVisible ? 'hidden' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
          disabled && 'opacity-50 cursor-not-allowed pointer-events-none'
        )}
        disabled={disabled}
      >
        <Search className="w-4 h-4" />
      </button>

      <div 
        className={cn(
          'transition-all duration-200 ease-in-out',
          isVisible 
            ? 'w-56 opacity-100' 
            : 'w-0 opacity-0',
          disabled && 'opacity-50'
        )}
      >
        <div className={cn(
          'relative h-9',
          !isVisible && 'invisible'
        )}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search menu items..."
            className={cn(
              "w-full h-full border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 px-[12px] py-[8px] transition-all duration-200",
              disabled && "bg-gray-50 cursor-not-allowed"
            )}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          />
          <button
            onClick={() => {
              onVisibilityChange(false);
              onChange('');
            }}
            className={cn(
              "absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-all duration-200 hover:scale-110 active:scale-90",
              disabled && "opacity-50 cursor-not-allowed pointer-events-none"
            )}
            disabled={disabled}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
} 