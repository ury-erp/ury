import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@ury/ui';

interface SideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const SideDrawer: React.FC<SideDrawerProps> = ({ isOpen, onClose, title, children }) => {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/40 transition-opacity backdrop-blur-sm" 
        onClick={onClose}
      />
      <div 
        className="relative h-fit max-h-[90vh] w-full max-w-lg bg-white rounded-lg shadow-2xl z-[101] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          <Button variant="outline" size="sm" onClick={onClose} className="p-2 h-auto rounded-full border-none hover:bg-gray-100 bg-transparent text-gray-500 hover:text-gray-900">
            <X className="w-5 h-5" />
          </Button>
        </div>
        <div className="flex-1 p-6 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SideDrawer;
