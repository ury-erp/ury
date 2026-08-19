import { ReactNode } from 'react';
import { Button } from '@ury/ui';
import { Check } from 'lucide-react';
import uryLogo from '../../../Public/photo_2026-08-19_13-24-09.jpg';

interface WizardLayoutProps {
  step: 1 | 2;
  children: ReactNode;
  onNext?: () => void;
  onPrev?: () => void;
  nextLabel?: string;
  isNextDisabled?: boolean;
  isNextLoading?: boolean;
  /** Rendered next to the primary action in the footer — e.g. a de-emphasized "Just show me a demo" link. */
  secondaryAction?: ReactNode;
}

const SHELL_WIDTH = 'max-w-[1400px] mx-auto px-6 md:px-10';

export function WizardLayout({
  step,
  children,
  onNext,
  onPrev,
  nextLabel = 'Next',
  isNextDisabled,
  isNextLoading,
  secondaryAction,
}: WizardLayoutProps) {
  const version = (window as any).frappe?.boot?.versions?.ury || 'v3.2.0';

  return (
    <div className="min-h-screen w-full flex flex-col bg-background">
      {/* Header bar */}
      <header className="w-full border-b border-border bg-card">
        <div className={`${SHELL_WIDTH} h-16 flex items-center justify-between gap-4`}>
          <div className="flex items-center gap-3">
            <img src={uryLogo} alt="URY Logo" className="h-7 w-auto" />
            <span className="text-sm font-semibold text-foreground leading-none">Let's get your restaurant ready</span>
          </div>

          {/* 2-step breadcrumb (Setup, Configure) */}
          <div className="hidden sm:flex items-center gap-2">
            <BreadcrumbStep label="Setup" state={step === 1 ? 'active' : 'done'} />
            <div className={`w-8 h-px ${step === 2 ? 'bg-primary' : 'bg-border'}`} />
            <BreadcrumbStep label="Configure" state={step === 2 ? 'active' : 'upcoming'} />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className={`${SHELL_WIDTH} flex-1 w-full py-8`}>
        <div className="rounded-xl border border-border bg-card p-6 md:p-8 shadow-sm">{children}</div>
      </main>

      {/* Footer nav bar */}
      <footer className="w-full border-t border-border bg-card sticky bottom-0 h-12 flex items-center">
        <div className={`${SHELL_WIDTH} w-full h-full flex items-center justify-between gap-4`}>
          <div className="flex items-center h-full">
            {step === 2 && onPrev && (
              <Button variant="outline" onClick={onPrev}>
                Previous
              </Button>
            )}
          </div>

          <div className="flex items-center gap-4 h-full">
            {secondaryAction}
            <Button variant="default" onClick={onNext} disabled={isNextDisabled || isNextLoading} className="px-6">
              {isNextLoading ? 'Working...' : nextLabel}
            </Button>
          </div>
        </div>
      </footer>

      <div className="py-3 text-center text-xs text-muted-foreground">URY · {version}</div>
    </div>
  );
}

function BreadcrumbStep({ label, state }: { label: string; state: 'active' | 'done' | 'upcoming' }) {
  return (
    <div className="flex items-center gap-2">
      {state === 'done' ? (
        <div className="w-6 h-6 rounded-full bg-primary text-white font-bold text-xs flex items-center justify-center shadow-sm">
          <Check className="w-3.5 h-3.5 stroke-[3]" />
        </div>
      ) : (
        <div
          className={`w-6 h-6 rounded-full font-bold text-xs flex items-center justify-center shadow-sm ${
            state === 'active' ? 'bg-primary text-white ring-4 ring-primary/15' : 'bg-muted text-muted-foreground'
          }`}
        >
          {label === 'Setup' ? 1 : 2}
        </div>
      )}
      <span className={`text-sm ${state === 'active' ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'}`}>
        {label}
      </span>
    </div>
  );
}
