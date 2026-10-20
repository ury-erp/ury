import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@ury/ui';

interface SideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export const SideDrawer: React.FC<SideDrawerProps> = ({ isOpen, onClose, title, subtitle, children, maxWidth = 'max-w-lg' }) => {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onClose();
  };

  const handleContentClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div 
        className="absolute inset-0 bg-black/40 transition-opacity backdrop-blur-sm" 
        onClick={handleBackdropClick}
      />
      <div
        className={`relative h-fit max-h-[90vh] w-full ${maxWidth} bg-card rounded-lg shadow-2xl z-[101] flex flex-col overflow-hidden`}
        onClick={handleContentClick}
      >
        <div className="flex items-center justify-between p-6 border-b border-border bg-muted/50">
          <div>
            <h2 className="text-xl font-bold text-foreground">{title}</h2>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5 font-mono">{subtitle}</p>}
          </div>
          <Button variant="outline" onClick={onClose} className="p-2 h-auto rounded-full border-none hover:bg-muted bg-transparent text-muted-foreground hover:text-foreground">
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
