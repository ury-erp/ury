import { ReactNode } from 'react';
import { Button, Card, Page } from '@ury/ui';
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

// App.tsx routes the wizard as a *sibling* of the dashboard, not a child, so
// it never inherits DashboardLayout's shell. Everything below therefore
// restates that shell by hand: the same `text-sm`/Inter base, the same h-12
// header, and the same max-width + `page-x` gutter that `<Page>` applies to
// every dashboard route. Keep this in step with DashboardLayout/Header.
const SHELL = 'max-w-[1440px] mx-auto px-page-x';

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
  return (
    <div className="min-h-screen w-full flex flex-col bg-background text-foreground font-inter text-sm">
      {/* Header bar — mirrors components/layout/Header.tsx */}
      <header className="w-full border-b border-border bg-background">
        <div className={`${SHELL} h-12 flex items-center justify-between gap-4`}>
          <div className="flex items-center space-x-4 min-w-0">
            <img src={uryLogo} alt="URY Logo" className="h-8 w-auto shrink-0" />
            <div className="hidden sm:block h-4 w-px bg-border shrink-0" />
            <span className="text-sm font-semibold text-foreground truncate">Let's get your restaurant ready</span>
          </div>

          {/* 2-step breadcrumb (Setup, Configure) */}
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <BreadcrumbStep label="Setup" state={step === 1 ? 'active' : 'done'} />
            <div className={`w-8 h-px ${step === 2 ? 'bg-primary' : 'bg-border'}`} />
            <BreadcrumbStep label="Configure" state={step === 2 ? 'active' : 'upcoming'} />
          </div>
        </div>
      </header>

      {/* Content */}
      <Page className="flex-1 w-full">
        <Card padding="lg">{children}</Card>
      </Page>

      {/* Footer nav bar */}
      <footer className="w-full border-t border-border bg-card sticky bottom-0 py-4">
        <div className={`${SHELL} w-full flex items-center justify-between gap-4`}>
          <div className="flex items-center">
            {step === 2 && onPrev && (
              <Button variant="outline" onClick={onPrev}>
                Previous
              </Button>
            )}
          </div>

          <div className="flex items-center gap-4">
            {secondaryAction}
            <Button variant="default" onClick={onNext} disabled={isNextDisabled || isNextLoading} className="px-6">
              {isNextLoading ? 'Working...' : nextLabel}
            </Button>
          </div>
        </div>
      </footer>
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
