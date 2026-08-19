import { ReactNode } from 'react';
import { Button } from '@ury/ui';
import { Check } from 'lucide-react';
import uryLogo from '../../../Public/URY-bg.png';

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

export function WizardLayout({ step, children, onNext, onPrev, nextLabel = 'Next', isNextDisabled, isNextLoading }: WizardLayoutProps) {
  const version = (window as any).frappe?.boot?.versions?.ury || 'v3.2.0';

  return (
    <div className="min-h-screen flex flex-col items-center py-12 px-4 bg-[#F9FAFB] relative overflow-hidden">

      <div className="relative z-10 w-full max-w-[820px] mb-8 flex flex-col items-center">
        <img src={uryLogo} alt="URY Logo" className="h-16 w-auto object-contain mb-3" />
        <p className="text-gray-500">Let's get your restaurant ready.</p>
      </div>

      <div className="relative z-10 w-full max-w-[820px] bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] flex flex-col h-[700px] overflow-hidden">
        
        {/* Step Breadcrumb */}
        <div className="px-10 py-5 border-b border-gray-100">
          <div className="w-full flex items-center justify-between">
            {/* Step 1 */}
            <div className="flex items-center">
              {step === 1 ? (
                <div className="w-6 h-6 rounded-full bg-primary text-white font-bold text-xs flex items-center justify-center shadow-sm ring-4 ring-primary-50">
                  1
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full bg-primary text-white font-bold text-xs flex items-center justify-center shadow-sm">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
              )}
              <span className={`ml-2 text-sm ${step === 1 ? 'font-semibold text-gray-900' : 'font-medium text-gray-600'}`}>
                Setup
              </span>
            </div>

            {/* Connecting Line */}
            <div className={`flex-1 mx-4 ${step === 2 ? 'h-0.5 bg-primary' : 'h-px bg-gray-200'}`} />

            {/* Step 2 */}
            <div className="flex items-center">
              {step === 2 ? (
                <div className="w-6 h-6 rounded-full bg-primary text-white font-bold text-xs flex items-center justify-center shadow-sm ring-4 ring-primary-50">
                  2
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-400 font-medium text-xs flex items-center justify-center">
                  2
                </div>
              )}
              <span className={`ml-2 text-sm ${step === 2 ? 'font-bold text-gray-900' : 'font-medium text-gray-400'}`}>
                Configure
              </span>
            </div>

            {/* Connecting Line 2-3 */}
            <div className="flex-1 mx-4 h-px bg-gray-200" />
            
            {/* Step 3 */}
            <div className="flex items-center">
              <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-400 font-medium text-xs flex items-center justify-center">
                3
              </div>
              <span className="ml-2 text-sm font-medium text-gray-400">
                Launch
              </span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 flex-1 overflow-y-auto">
          {children}
        </div>

        {/* Footer Nav */}
        <div className="px-8 py-4 bg-[#F9FAFB] border-t border-gray-100 flex items-center justify-between">
          <div className="w-24">
            {step === 2 && onPrev && (
              <Button variant="outline" onClick={onPrev}>
                Previous
              </Button>
            )}
          </div>
          
          <div className="flex gap-1.5">
            <div className={`w-2 h-2 rounded-full ${step === 1 ? 'bg-primary' : 'bg-gray-200'}`} />
            <div className={`w-2 h-2 rounded-full ${step === 2 ? 'bg-primary' : 'bg-gray-200'}`} />
            <div className="w-2 h-2 rounded-full bg-gray-200" />
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

      <div className="mt-8 text-sm text-gray-400">
        URY · {version}
      </div>
    </div>
  );
}
