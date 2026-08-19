import { useState } from 'react';
import { Info } from 'lucide-react';
import { Card, CardContent } from '@ury/ui';

interface InstallationTypeCardProps {
  type: any;
  selected: boolean;
  onSelect: () => void;
}

export function InstallationTypeCard({ type, selected, onSelect }: InstallationTypeCardProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <Card 
      className={`relative cursor-pointer transition-all duration-200 ${selected ? 'border-2 border-primary bg-primary-50' : 'border border-border hover:border-primary bg-card'}`}
      onClick={onSelect}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-2 relative">
          <h4 className="text-sm font-semibold text-foreground">{type.title}</h4>
          
          <div 
            className="relative inline-block cursor-help text-muted-foreground hover:text-foreground"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onTouchStart={(e) => {
              e.stopPropagation();
              setShowTooltip(prev => !prev);
            }}
          >
            <Info className="w-4 h-4 shrink-0" />
            
            {showTooltip && (
              <div 
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-[440px] max-w-[calc(100vw-2rem)] bg-white border border-gray-200 text-black text-xs font-normal p-3.5 rounded-lg shadow-xl leading-relaxed z-50 pointer-events-none transition-all duration-150 animate-dialog-in"
                style={{ contentVisibility: 'auto' }}
              >
                {type.description}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-white" />
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
