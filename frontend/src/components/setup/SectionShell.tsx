import { ReactNode } from 'react';

interface SectionShellProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function SectionShell({ title, description, children }: SectionShellProps) {
  return (
    <div className="flex flex-col space-y-6">
      <div className="flex items-start justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
      </div>

      <div className="flex-1">{children}</div>
    </div>
  );
}
