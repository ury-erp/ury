import { CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@ury/ui';

interface InstallationTypeCardProps {
  type: any;
  selected: boolean;
  onSelect: () => void;
}

export function InstallationTypeCard({ type, selected, onSelect }: InstallationTypeCardProps) {
  return (
    <Card 
      className={`relative cursor-pointer transition-all duration-200 ${selected ? 'border-2 border-[#2B5CE6] bg-[#EFF4FF]' : 'border border-border hover:border-[#2B5CE6] bg-card'}`}
      onClick={onSelect}
    >
      
      <CardContent className="p-4">
        <h4 className="text-sm font-semibold text-foreground mb-1">{type.title}</h4>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {type.description}
        </p>
      </CardContent>
    </Card>
  );
}
