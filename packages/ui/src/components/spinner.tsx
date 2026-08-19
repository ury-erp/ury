import { cn } from '../lib/cn';

interface SpinnerProps {
  className?: string;
  message?: string;
  hideMessage?: boolean;
}

export function Spinner({ className, message, hideMessage = false}: SpinnerProps) {
  const displayMessage = message ?? 'Loading...';
  return (
    <div className="flex items-center justify-center min-h-[inherit]" role="status" aria-live="polite">
      <div className="text-center">
        <div
          aria-hidden="true"
          className={cn(
            // A full ring with one lit arc, rather than two opposing arcs.
            // The faint track keeps the shape legible at every rotation angle
            // instead of flickering between two detached dashes.
            "animate-spin rounded-full h-10 w-10 border-2 border-primary/20 border-t-primary mx-auto",
            className
          )}
        />
        {!hideMessage && displayMessage && (
          <p className="mt-3 text-sm text-muted-foreground">{displayMessage}</p>
        )}
      </div>
    </div>
  );
}
