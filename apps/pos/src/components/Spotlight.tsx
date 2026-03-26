//Not currently used, will update later
import { useState, useEffect, useRef } from 'react';
import { Search, Command, X } from 'lucide-react';
import { usePOSStore } from '../store/pos-store';
import { cn } from '../lib/utils';
import { Button, Input } from './ui';
import { Dialog, DialogContent } from './ui/dialog';

const Spotlight = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { menuItems, addToOrder, setSelectedItem } = usePOSStore();

  const filteredItems = menuItems.filter(item =>
    item.name.toLowerCase().includes(query.toLowerCase()) ||
    item.category.toLowerCase().includes(query.toLowerCase())
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
      <DialogContent className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-0">
        <div className="flex items-center border-b border-gray-200 p-4">
          <Search className="w-5 h-5 text-gray-400 mr-3" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="Search menu items..."
            className="flex-1 outline-none text-lg border-0 shadow-none focus:ring-0"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <Button
            onClick={() => setIsOpen(false)}
            variant="ghost"
            size="icon"
            className="ml-3"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {filteredItems.length > 0 ? (
            filteredItems.map((item, index) => (
              <Button
                key={item.id}
                onClick={() => handleSelect(item)}
                variant="ghost"
                className={cn(
                  'w-full flex items-center p-4 hover:bg-gray-50 transition-colors',
                  index === selectedIndex && 'bg-blue-50'
                )}
              >
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-12 h-12 object-cover rounded mr-4"
                />
                <div className="flex-1 text-left">
                  <div className="font-medium">{item.name}</div>
                  <div className="text-sm text-gray-500">{item.category}</div>
                </div>
                <div className="text-right">
                  <div className="font-medium">₹{item.price}</div>
                </div>
              </Button>
            ))
          ) : (
            <div className="p-4 text-center text-gray-500">
              No items found
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 p-4 text-sm text-gray-500">
          <div className="flex items-center justify-between">
            <span>Use ↑↓ to navigate, Enter to select</span>
            <div className="flex items-center gap-2">
              <Command className="w-4 h-4" />
              <span>K</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
export default Spotlight; 
