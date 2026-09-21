import { ReactNode } from 'react';
import { Section } from '@ury/ui';

interface SectionShellProps {
  title: string;
  description?: string;
  children: ReactNode;
}

// Wraps the shared `<Section>` rather than restating its rhythm: the heading
// uses the same size/weight as CardTitle and DialogTitle so a wizard step
// states its title in the same voice as a dashboard panel.
export function SectionShell({ title, description, children }: SectionShellProps) {
  return (
    <Section className="mt-0 flex flex-col">
      <Section.Header className="flex items-start justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold leading-tight tracking-tight text-foreground">{title}</h2>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
      </Section.Header>

      <div className="flex-1">{children}</div>
    </Section>
  );
}
