import { ChevronRight, CheckCircle2 } from 'lucide-react';

interface ConfigureItemProps {
  item: any;
  completed: boolean;
  onClick: (id: string) => void;
}

export function ConfigureItem({ item, completed, onClick }: ConfigureItemProps) {
  return (
    <div 
      className="flex items-center p-4 border-b border-gray-100 last:border-0 hover:bg-[#F9FAFB] cursor-pointer transition-colors"
      onClick={() => {
        window.open(item.route, "_blank");
        onClick(item.id);
      }}
    >
      <div className="flex-1">
        <div className="flex items-center gap-3 mb-1">
          <h4 className="text-sm font-medium text-gray-900">{item.label}</h4>
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-[#F0FDF4] text-[#16A34A]">
            Optional
          </span>
        </div>
        <p className="text-xs text-gray-400">
          {item.description}
        </p>
      </div>
      <div className="w-6 h-6 flex items-center justify-center shrink-0">
        {completed ? (
          <CheckCircle2 className="w-5 h-5 text-[#16A34A] fill-current" />
        ) : (
          <ChevronRight className="w-5 h-5 text-gray-400" />
        )}
      </div>
    </div>
  );
}
