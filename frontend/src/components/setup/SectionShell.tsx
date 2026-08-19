import { ReactNode } from 'react';
import { useConfigure, UNSKIPPABLE_SECTIONS } from '../../context/ConfigureContext';
import { Button } from '@ury/ui';

interface SectionShellProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function SectionShell({ title, description, children }: SectionShellProps) {
  const { activeSection, useDefaultsForSection } = useConfigure();
  const canUseDefaults = !UNSKIPPABLE_SECTIONS.includes(activeSection);

  return (
    <div className="flex flex-col space-y-6">
      <div className="flex items-start justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>

        {canUseDefaults && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => useDefaultsForSection()}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            Use the defaults
          </Button>
        )}
      </div>

      <div className="flex-1">{children}</div>
    </div>
  );
}
