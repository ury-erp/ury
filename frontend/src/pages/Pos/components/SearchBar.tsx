import { useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { Button, Input, cn } from '@ury/ui';

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
      <Button
        onClick={() => onVisibilityChange(true)}
        variant="secondary"
        size="sm"
        className={cn(
          'flex items-center gap-2 rounded-full transition-all duration-200 ease-in-out hover:scale-105 active:scale-95',
          isVisible && 'hidden',
          disabled && 'opacity-50 cursor-not-allowed pointer-events-none'
        )}
        disabled={disabled}
      >
        <Search className="w-4 h-4" />
      </Button>

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
          <Input
            ref={inputRef}
            type="text"
            placeholder="Search menu items..."
            variant="search"
            size="sm"
            className={cn(
              "rounded-full transition-all duration-200",
              disabled && "cursor-not-allowed"
            )}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          />
          <Button
            onClick={() => {
              onVisibilityChange(false);
              onChange('');
            }}
            variant="ghost"
            size="sm"
            className={cn(
              "absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0 text-gray-400 hover:text-gray-600 transition-all duration-200 hover:scale-110 active:scale-90",
              disabled && "opacity-50 cursor-not-allowed pointer-events-none"
            )}
            disabled={disabled}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
