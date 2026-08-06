import { ReactNode } from 'react';
import { Button } from '@ury/ui';
import { Check } from 'lucide-react';

interface WizardLayoutProps {
  step: 1 | 2;
  children: ReactNode;
  onNext?: () => void;
  onPrev?: () => void;
  onLaunch?: () => void;
  nextLabel?: string;
  isNextDisabled?: boolean;
  isNextLoading?: boolean;
}

export function WizardLayout({ step, children, onNext, onPrev, onLaunch, nextLabel = 'Next', isNextDisabled, isNextLoading }: WizardLayoutProps) {
  const version = (window as any).frappe?.boot?.versions?.ury || 'v3.2.0';

  return (
    <div className="min-h-screen flex flex-col items-center py-12 px-4 bg-[#F9FAFB] relative overflow-hidden">
      {/* Top Background Image */}
      <div 
        className="absolute top-0 left-0 right-0 h-72 bg-cover bg-top bg-no-repeat pointer-events-none z-0" 
        style={{ backgroundImage: "url('/assets/ury/Images/URY-bg.png')" }} 
      />

      <div className="relative z-10 w-full max-w-[820px] mb-8 flex flex-col items-center">
        <img src="/assets/ury/Images/ury.png" alt="URY Logo" className="h-16 w-auto object-contain mb-3" />
        <p className="text-[#6B7280]">Let's get your restaurant ready.</p>
      </div>

      <div className="relative z-10 w-full max-w-[820px] bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] overflow-hidden flex flex-col">
        
        {/* Step Breadcrumb */}
        <div className="px-10 py-5 border-b border-[#F3F4F6]">
          <div className="w-full flex items-center justify-between">
            {/* Step 1 */}
            <div className="flex items-center">
              {step === 1 ? (
                <div className="w-6 h-6 rounded-full bg-[#2B5CE6] text-white font-bold text-xs flex items-center justify-center shadow-sm ring-4 ring-[#EFF4FF]">
                  1
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full bg-[#2B5CE6] text-white font-bold text-xs flex items-center justify-center shadow-sm">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
              )}
              <span className={`ml-2 text-sm ${step === 1 ? 'font-semibold text-[#111827]' : 'font-medium text-[#4B5563]'}`}>
                Setup
              </span>
            </div>

            {/* Connecting Line */}
            <div className={`flex-1 mx-4 ${step === 2 ? 'h-0.5 bg-[#2B5CE6]' : 'h-px bg-[#E5E7EB]'}`} />

            {/* Step 2 */}
            <div className="flex items-center">
              {step === 2 ? (
                <div className="w-6 h-6 rounded-full bg-[#2B5CE6] text-white font-bold text-xs flex items-center justify-center shadow-sm ring-4 ring-[#EFF4FF]">
                  2
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full bg-[#F3F4F6] text-[#9CA3AF] font-medium text-xs flex items-center justify-center">
                  2
                </div>
              )}
              <span className={`ml-2 text-sm ${step === 2 ? 'font-bold text-[#111827]' : 'font-medium text-[#9CA3AF]'}`}>
                Configure
              </span>
            </div>

            {/* Connecting Line 2-3 */}
            <div className="flex-1 mx-4 h-px bg-[#E5E7EB]" />
            
            {/* Step 3 */}
            <div className="flex items-center">
              <div className="w-6 h-6 rounded-full bg-[#F3F4F6] text-[#9CA3AF] font-medium text-xs flex items-center justify-center">
                3
              </div>
              <span className="ml-2 text-sm font-medium text-[#9CA3AF]">
                Launch
              </span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 flex-1">
          {children}
        </div>

        {/* Footer Nav */}
        <div className="px-8 py-4 bg-[#F9FAFB] border-t border-[#F3F4F6] flex items-center justify-between">
          <div className="w-24">
            {step === 2 && onPrev && (
              <Button variant="outline" onClick={onPrev}>
                Previous
              </Button>
            )}
          </div>
          
          <div className="flex gap-1.5">
            <div className={`w-2 h-2 rounded-full ${step === 1 ? 'bg-[#2B5CE6]' : 'bg-[#E5E7EB]'}`} />
            <div className={`w-2 h-2 rounded-full ${step === 2 ? 'bg-[#2B5CE6]' : 'bg-[#E5E7EB]'}`} />
            <div className="w-2 h-2 rounded-full bg-[#E5E7EB]" />
          </div>

          <div className="min-w-[150px] flex justify-end gap-3">
            <Button 
              variant="default"
              onClick={onNext} 
              disabled={isNextDisabled || isNextLoading}
              className="px-6"
            >
              {isNextLoading ? 'Working...' : nextLabel}
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-8 text-sm text-[#9CA3AF]">
        URY · {version}
      </div>
    </div>
  );
}
