import { CheckCircle2, Circle, Loader2 } from 'lucide-react';

import { PROGRESS_STEPS } from './constants';

interface ProgressModalProps {
  visible: boolean;
  activeIndex: number;
  error?: string | null;
}

export function ProgressModal({ visible, activeIndex, error }: ProgressModalProps) {
  if (!visible) return null;

  const totalSteps = PROGRESS_STEPS.length;
  const progressPercent = Math.min(100, Math.max(0, (activeIndex / totalSteps) * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-sm">
      <div className="w-full max-w-[540px] bg-white rounded-2xl shadow-xl overflow-hidden">
        
        {/* Segmented Top Bar */}
        <div className="flex px-10 pt-10 pb-6 gap-1">
          {Array.from({ length: totalSteps }).map((_, i) => {
            const segmentProgress = i < activeIndex
              ? 'bg-[#22C55E]' 
              : i === activeIndex
                ? 'bg-[#111827]' 
                : 'bg-[#E5E7EB]';
            return (
              <div key={i} className={`flex-1 h-1.5 rounded-full ${segmentProgress}`} />
            );
          })}
        </div>

        <div className="px-10 pb-8">
          <h2 className="text-2xl font-semibold text-foreground mb-1">Setting up your restaurant</h2>
          <p className="text-sm text-muted-foreground mb-6">
            This usually takes about 30 seconds.<br/>
            We're building everything from scratch.
          </p>
          
          <div className="flex flex-col mb-8">
            {PROGRESS_STEPS.map((step, idx) => {
              const isDone = idx < activeIndex;
              const isActive = idx === activeIndex;

              return (
                <div key={idx} className="flex items-center gap-4 py-3 border-b border-[#F3F4F6] last:border-0 h-12">
                  <div className="w-6 h-6 flex items-center justify-center shrink-0">
                    {isDone ? (
                      <CheckCircle2 className="w-6 h-6 text-white fill-[#22C55E]" />
                    ) : isActive ? (
                      <Loader2 className="w-6 h-6 text-[#2B5CE6] animate-spin" />
                    ) : (
                      <Circle className="w-6 h-6 text-[#E5E7EB]" />
                    )}
                  </div>
                  <span className={`text-sm ${isActive ? 'font-medium text-[#111827]' : isDone ? 'text-foreground' : 'text-[#9CA3AF]'}`}>
                    {step}
                  </span>
                  {isActive && <div className="ml-auto w-4 h-4 rounded-full border-2 border-[#E5E7EB]" />}
                </div>
              );
            })}
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-600 text-sm rounded-lg border border-red-200">
              {error}
            </div>
          )}

          {/* Bottom Progress Bar */}
          <div className="h-1.5 w-full bg-[#E5E7EB] rounded-full overflow-hidden">
            <div 
              className="h-full bg-[#2B5CE6] rounded-full transition-all duration-400 ease-in-out" 
              style={{ width: `${progressPercent}%` }} 
            />
          </div>
        </div>
        
      </div>
    </div>
  );
}
