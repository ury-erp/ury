import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@ury/ui';
import { WizardLayout } from '../../components/setup/WizardLayout';
import { ConfigureSidebar } from '../../components/setup/ConfigureSidebar';
import { SectionShell } from '../../components/setup/SectionShell';
import { ConfigureProvider, useConfigure, SECTION_ORDER, SectionId } from '../../context/ConfigureContext';
import { BranchSection } from '../../components/setup/sections/BranchSection';
import { RoomSection } from '../../components/setup/sections/RoomSection';
import { TableSection } from '../../components/setup/sections/TableSection';
import { MenuSection } from '../../components/setup/sections/MenuSection';
import { PaymentSection } from '../../components/setup/sections/PaymentSection';
import { UserSection } from '../../components/setup/sections/UserSection';
import { setupService } from '../../services/setup';
import { CONFIGURE_PROGRESS_STEPS } from '../../components/setup/constants';
import { ProgressModal } from '../../components/setup/ProgressModal';

const SECTION_CONFIGS: Record<SectionId, { title: string; description: string }> = {
  branch: {
    title: 'Branch Details',
    description: 'Set up your main branch name, invoice numbering, and tax details.',
  },
  rooms: {
    title: 'Rooms',
    description: 'Add the seating areas in your restaurant — you\'ll set how many tables each one has.',
  },
  tables: {
    title: 'Tables',
    description: 'Review and adjust the tables we generated for each room — rename, adjust seats, or add more.',
  },
  menu: {
    title: 'Menu',
    description: 'Add a few items to get started — you can bulk-import or add hundreds more anytime later.',
  },
  payment: {
    title: 'Payments',
    description: 'How your customers will pay. Cash is added by default — add Card, UPI, or others your restaurant accepts.',
  },
  users: {
    title: 'Staff Accounts',
    description: 'Add login accounts for your staff now, or skip this and add them later. We\'ve suggested a starting cashier account below.',
  },
};

function ConfigurePageContent() {
  const navigate = useNavigate();
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  // pendingFinish holds the data until the realtime listener is ready
  const pendingFinish = useRef<object | null>(null);

  const {
    activeSection,
    branch,
    rooms,
    tables,
    menuItems,
    taxConfig,
    paymentMethods,
    users,
    goToPrevSection,
    goToNextSection,
  } = useConfigure();

  const currentIndex = SECTION_ORDER.indexOf(activeSection);
  const isFirstSection = currentIndex === 0;
  const isLastSection = currentIndex === SECTION_ORDER.length - 1;

  const handlePrev = () => {
    if (isFirstSection) {
      navigate('/setup-wizard/0');
    } else {
      goToPrevSection();
    }
  };

  const doConfigureApiCall = useCallback(async () => {
    const payload = pendingFinish.current;
    if (!payload) return;
    pendingFinish.current = null;

    try {
      await setupService.submitConfigureData(payload);

      // Clear stale session snapshot so a fresh wizard run starts clean.
      sessionStorage.removeItem('ury.setup.configureState');

      // Mark all steps done
      setActiveIndex(CONFIGURE_PROGRESS_STEPS.length);

      setTimeout(() => {
        window.location.href = '/ury/dashboard';
      }, 800);
    } catch (err: any) {
      console.error('Failed to finish configure setup', err);
      let msg = 'Failed to configure setup. Check backend logs.';
      if (typeof err === 'string') {
        msg = err;
      } else if (err?.message) {
        msg = err.message;
      } else if (err?._server_messages) {
        try {
          const parsed = JSON.parse(err._server_messages);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const inner = typeof parsed[0] === 'string' ? JSON.parse(parsed[0]) : parsed[0];
            msg = inner.message || msg;
          }
        } catch (_) {
          msg = String(err._server_messages);
        }
      } else if (err?.exception) {
        msg = err.exception;
      }
      setError(msg);
      setFinishing(false);
    }
  }, []);

  const handleFinish = () => {
    const payload = {
      branch,
      rooms,
      tables,
      menuItems,
      taxConfig,
      paymentMethods,
      users,
    };
    pendingFinish.current = payload;
    setFinishing(true);
    setError(null);
    setActiveIndex(0);
    // doConfigureApiCall() is triggered by ProgressModal's onReady once
    // the realtime listener is confirmed attached.
  };

  const handleNext = () => {
    if (isLastSection) {
      handleFinish();
    } else {
      goToNextSection();
    }
  };

  const renderSection = () => {
    switch (activeSection) {
      case 'branch':
        return <BranchSection />;
      case 'rooms':
        return <RoomSection />;
      case 'tables':
        return <TableSection />;
      case 'menu':
        return <MenuSection />;
      case 'payment':
        return <PaymentSection />;
      case 'users':
        return <UserSection />;
      default:
        return <BranchSection />;
    }
  };

  const config = SECTION_CONFIGS[activeSection] || SECTION_CONFIGS.branch;

  return (
    <WizardLayout
      step={2}
      onPrev={handlePrev}
      onNext={handleNext}
      nextLabel={isLastSection ? "Launch" : "Next"}
      isNextLoading={finishing}
      secondaryAction={
        <Button
          type="button"
          variant="ghost"
          onClick={handleFinish}
          disabled={finishing}
        >
          Finish with defaults
        </Button>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-red-700">
            <div className="flex-1 text-sm font-medium">
              <span className="font-bold block mb-1">Configuration Error:</span>
              {error}
            </div>
            <button
              onClick={() => setError(null)}
              className="text-xs text-red-500 hover:text-red-700 font-semibold underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Sidebar + content — the page scrolls naturally now, no fixed-height card to bleed into */}
        <div className="flex flex-col md:flex-row gap-6 md:gap-8">
          <div className="w-full md:w-64 shrink-0 md:sticky md:top-8 md:self-start">
            <ConfigureSidebar />
          </div>

          <div className="flex-1 min-w-0">
            <SectionShell title={config.title} description={config.description}>
              {renderSection()}
            </SectionShell>
          </div>
        </div>
      </div>

      {finishing && (
        <ProgressModal 
          visible={true} 
          activeIndex={activeIndex} 
          error={error} 
          steps={CONFIGURE_PROGRESS_STEPS} 
          eventName="ury_configure_progress"
          onStepChange={setActiveIndex}
          onReady={doConfigureApiCall}
        />
      )}
    </WizardLayout>
  );
}

export default function ConfigurePage() {
  return (
    <ConfigureProvider>
      <ConfigurePageContent />
    </ConfigureProvider>
  );
}
