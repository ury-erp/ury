//Not currently used, will update later
import { useState, useEffect, useRef } from 'react';
import { Search, Command, X } from 'lucide-react';
import { usePOSStore } from '../store/pos-store';
import { cn } from '@ury/ui';
import { formatCurrency } from '@ury/core';
import { Button, Input } from '@ury/ui';
import { Dialog, DialogContent } from '@ury/ui';

const Spotlight = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { menuItems, setSelectedItem } = usePOSStore();

  const filteredItems = menuItems.filter(item =>
    item.name.toLowerCase().includes(query.toLowerCase()) ||
    item.category?.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 10);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (item: typeof menuItems[0]) => {
    setSelectedItem(item);
    setIsOpen(false);
    setQuery('');
    setSelectedIndex(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filteredItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && filteredItems[selectedIndex]) {
      e.preventDefault();
      handleSelect(filteredItems[selectedIndex]);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="bg-card border border-hair rounded-[9px] w-full max-w-2xl p-0 shadow-xl">
        <div className="flex items-center border-b border-hair p-4 gap-[7px]">
          <Search className="w-5 h-5 text-text-tertiary flex-none" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="Search menu items..."
            className="flex-1 outline-none text-sm border-0 shadow-none focus:ring-0 focus-visible:ring-0 bg-transparent"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <Button
            onClick={() => setIsOpen(false)}
            variant="ghost"
            className="w-7 h-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted rounded-[7px] flex-none"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {filteredItems.length > 0 ? (
            filteredItems.map((item, index) => (
              <button
                key={item.id}
                onClick={() => handleSelect(item)}
                className={cn(
                  'w-full flex items-center gap-3 p-4 text-left transition-colors',
                  'hover:bg-muted',
                  index === selectedIndex && 'bg-primary-tint'
                )}
              >
                <img
                  src={item.image ?? undefined}
                  alt={item.name}
                  className="w-12 h-12 object-cover rounded flex-none"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">{item.name}</div>
                  <div className="text-xs text-text-tertiary">{item.category}</div>
                </div>
                <div className="text-end font-mono text-sm text-muted-foreground flex-none">
                  {formatCurrency(item.price)}
                </div>
              </button>
            ))
          ) : (
            <div className="p-4 text-center text-sm text-text-tertiary">
              No items found
            </div>
          )}
        </div>

        <div className="border-t border-hair p-4 text-[10.5px] uppercase tracking-[0.05em] text-text-tertiary font-medium">
          <div className="flex items-center justify-between">
            <span>Use ↑↓ to navigate, Enter to select</span>
            <div className="flex items-center gap-1 font-mono text-xs">
              <Command className="w-3.5 h-3.5" />
              <span>K</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
export default Spotlight; 
