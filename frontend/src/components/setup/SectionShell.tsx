import { ReactNode } from 'react';
import { useConfigure } from '../../context/ConfigureContext';
import { Button } from '@ury/ui';

interface SectionShellProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function SectionShell({ title, description, children }: SectionShellProps) {
  const { activeSection, skipSection } = useConfigure();
  const isLastSection = activeSection === 'users';

  return (
    <div className="flex flex-col min-h-[420px] space-y-6">
      <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#F3F4F6]">
        <div>
          <h2 className="text-xl font-bold text-[#111827]">{title}</h2>
          {description && (
            <p className="text-sm text-[#6B7280] mt-1">{description}</p>
          )}
        </div>
      </div>

      <div className="flex-1">
        {children}
      </div>
    </div>
  );
}
