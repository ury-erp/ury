import { ReactNode } from 'react';
import { Button } from '@ury/ui';
import { CircleDot } from 'lucide-react';

interface WizardLayoutProps {
  step: 1 | 2;
  children: ReactNode;
  onNext?: () => void;
  onPrev?: () => void;
  nextLabel?: string;
  isNextDisabled?: boolean;
  isNextLoading?: boolean;
}

export function WizardLayout({ step, children, onNext, onPrev, nextLabel = 'Next', isNextDisabled, isNextLoading }: WizardLayoutProps) {
  const version = (window as any).frappe?.boot?.versions?.ury || 'v3.2.0';

  return (
    <div className="min-h-screen flex flex-col items-center py-12 px-4 bg-[#F9FAFB]">
      <div className="w-full max-w-[820px] mb-8 flex flex-col items-center">
        <img src="/assets/ury/Images/ury.png" alt="URY Logo" className="h-16 w-auto object-contain mb-3" />
        <p className="text-[#6B7280]">Let's get your restaurant ready.</p>
      </div>

      <div className="w-full max-w-[820px] bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] overflow-hidden flex flex-col">
        
        {/* Step Breadcrumb */}
        <div className="px-8 py-6 border-b border-[#F3F4F6] flex items-center justify-center">
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 ${step === 1 ? 'text-[#2B5CE6]' : 'text-[#6B7280]'}`}>
              {step === 1 ? <CircleDot className="w-5 h-5 fill-current text-white" /> : <div className="w-5 h-5 rounded-full border-2 border-current" />}
              <span className={`text-sm ${step === 1 ? 'font-bold' : 'font-medium'}`}>Setup</span>
            </div>
            
            <div className="w-16 h-px bg-[#E5E7EB]" />
            
            <div className={`flex items-center gap-2 ${step === 2 ? 'text-[#2B5CE6]' : 'text-[#6B7280]'}`}>
              {step === 2 ? <CircleDot className="w-5 h-5 fill-current text-white" /> : <div className="w-5 h-5 rounded-full border-2 border-current" />}
              <span className={`text-sm ${step === 2 ? 'font-bold' : 'font-medium'}`}>Configure</span>
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
              <Button variant="ghost" onClick={onPrev}>
                Previous
              </Button>
            )}
          </div>
          
          <div className="flex gap-1.5">
            <div className={`w-2 h-2 rounded-full ${step === 1 ? 'bg-[#2B5CE6]' : 'bg-[#E5E7EB]'}`} />
            <div className={`w-2 h-2 rounded-full ${step === 2 ? 'bg-[#2B5CE6]' : 'bg-[#E5E7EB]'}`} />
          </div>

          <div className="min-w-[150px] flex justify-end">
            <Button 
              onClick={onNext} 
              disabled={isNextDisabled || isNextLoading}
              className="bg-[#2B5CE6] hover:bg-[#1E40AF] text-white px-6 py-2.5 h-auto whitespace-nowrap text-sm font-semibold rounded-lg shadow-sm"
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
