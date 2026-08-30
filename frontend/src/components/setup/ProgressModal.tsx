import { useEffect, useRef } from 'react';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { subscribeRealtimeEvent } from '../../lib/realtimeClient';
import { PROGRESS_STEPS } from './constants';

interface ProgressModalProps {
  visible: boolean;
  activeIndex: number;
  error?: string | null;
  steps?: string[];
  eventName?: string;
  onStepChange?: (index: number) => void;
  /** Called after the realtime subscription is attached — start the API call here */
  onReady?: () => void;
}

export function ProgressModal({
  visible,
  activeIndex,
  error,
  steps = PROGRESS_STEPS,
  eventName = 'ury_setup_progress',
  onStepChange,
  onReady,
}: ProgressModalProps) {
  // Keep onStepChange stable in a ref so the socket handler closure doesn't
  // capture a stale version on every render.
  const onStepChangeRef = useRef(onStepChange);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onStepChangeRef.current = onStepChange;
    onReadyRef.current = onReady;
  });

  useEffect(() => {
    if (!visible) return;

    const handler = (data: unknown) => {
      const payload = data as { step?: number; status?: string };
      if (typeof payload?.step !== 'number') return;

      if (payload.status === 'loading') {
        onStepChangeRef.current?.(payload.step);
      } else if (payload.status === 'completed') {
        onStepChangeRef.current?.(payload.step + 1);
      }
    };

    // Subscribe first, then signal the parent that it is safe to start the
    // backend API call.  subscribeRealtimeEvent is async internally (connects
    // the socket then calls .on()), but it registers the handler synchronously
    // on the socket once the connection resolves.  We call onReady() after
    // kicking off the subscription so the caller can await the socket before
    // starting the API.  subscribeRealtimeEvent returns a cleanup fn.
    const unsubscribe = subscribeRealtimeEvent(eventName, handler, () => {
      onReadyRef.current?.();
    });
    return unsubscribe;
    // Re-subscribe only if the event name changes or visibility toggles
  }, [visible, eventName]);

  if (!visible) return null;

  const totalSteps = steps.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-sm">
      <div className="w-full max-w-[540px] bg-card rounded-lg shadow-xl overflow-hidden">
        
        {/* Segmented Top Bar */}
        <div className="flex px-10 pt-10 pb-6 gap-1">
          {Array.from({ length: totalSteps }).map((_, i) => {
            const segmentProgress = i <= activeIndex ? 'bg-primary' : 'bg-muted';
            return (
              <div key={i} className={`flex-1 h-1.5 rounded-full ${segmentProgress}`} />
            );
          })}
        </div>

        <div className="px-10 pb-8">
          <h2 className="text-2xl font-semibold text-foreground mb-1">Setting up your restaurant</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Setting things up ,this usually takes less than a minute.
          </p>
          
          <div className="flex flex-col mb-4">
            {steps.map((step, idx) => {
              const isDone = idx < activeIndex;
              const isActive = idx === activeIndex;

              return (
                <div key={idx} className="flex items-center gap-4 py-3 border-b border-border last:border-0 h-12">
                  <div className="w-6 h-6 flex items-center justify-center shrink-0">
                    {isDone ? (
                      <CheckCircle2 className="w-6 h-6 text-white fill-green-500" />
                    ) : isActive ? (
                      <Loader2 className="w-6 h-6 text-primary animate-spin" />
                    ) : (
                      <Circle className="w-6 h-6 text-border" />
                    )}
                  </div>
                  <span className={`text-sm ${isActive ? 'font-medium text-foreground' : isDone ? 'text-foreground' : 'text-text-tertiary'}`}>
                    {step}
                  </span>
                </div>
              );
            })}
          </div>

          {error && (
            <div className="mt-4 p-4 bg-destructive-tint text-destructive text-sm rounded-lg border border-destructive-tint-border">
              {error}
            </div>
          )}
        </div>
        
      </div>
    </div>
  );
}
