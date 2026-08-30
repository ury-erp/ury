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
        variant="ghost"
        className={cn(
          'flex items-center justify-center w-7 h-7 rounded-[7px] text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-150',
          isVisible && 'hidden',
          disabled && 'opacity-50 cursor-not-allowed pointer-events-none'
        )}
        disabled={disabled}
      >
        <Search className="w-3.5 h-3.5" />
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
          'relative h-7 flex items-center gap-[7px] px-[9px] bg-muted rounded-[7px]',
          !isVisible && 'invisible'
        )}>
          <Input
            ref={inputRef}
            type="text"
            placeholder="Search menu items..."
            className={cn(
              "h-fit p-0 w-full bg-transparent border-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm placeholder:text-text-tertiary",
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
            className={cn(
              "absolute right-[9px] top-1/2 -translate-y-1/2 w-[28px] h-[28px] p-0 text-muted-foreground hover:text-foreground transition-all duration-150 flex-none",
              disabled && "opacity-50 cursor-not-allowed pointer-events-none"
            )}
            disabled={disabled}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
