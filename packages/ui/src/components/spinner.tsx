import { cn } from '../lib/cn';

interface SpinnerProps {
  className?: string;
  message?: string;
  hideMessage?: boolean;
}

export function Spinner({ className, message, hideMessage = false}: SpinnerProps) {
  const displayMessage = message ?? 'Loading...';
  return (
    <div className="flex items-center justify-center min-h-[inherit]">
      <div className="text-center">
        <div className={cn(
          "animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600 mx-auto",
          className
        )} />
        {!hideMessage && displayMessage && <p className="mt-4 text-gray-600">{displayMessage}</p>}
      </div>
    </div>
  );
}
