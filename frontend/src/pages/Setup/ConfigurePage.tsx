import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@ury/ui';
import { WizardLayout } from '../../components/setup/WizardLayout';
import { ConfigureSidebar } from '../../components/setup/ConfigureSidebar';
import { SectionShell } from '../../components/setup/SectionShell';
import {
  ConfigureProvider,
  useConfigure,
  SECTION_ORDER,
  SectionId,
} from '../../context/ConfigureContext';
import { BranchSection } from '../../components/setup/sections/BranchSection';
import { RoomSection } from '../../components/setup/sections/RoomSection';
import { TableSection } from '../../components/setup/sections/TableSection';
import { MenuSection } from '../../components/setup/sections/MenuSection';
import { PaymentSection } from '../../components/setup/sections/PaymentSection';
import { UserSection } from '../../components/setup/sections/UserSection';
import { setupService } from '../../services/setup';
import { call } from '@ury/core';
import { CONFIGURE_PROGRESS_STEPS } from '../../components/setup/constants';
import { ProgressModal } from '../../components/setup/ProgressModal';

const SECTION_CONFIGS: Record<
  SectionId,
  { title: string; description: string }
> = {
  branch: {
    title: 'Branch Details',
    description:
      'Set up your main branch name, invoice numbering, and tax details.',
  },
  rooms: {
    title: 'Rooms',
    description:
      "Add the seating areas in your restaurant — you'll set how many tables each one has.",
  },
  tables: {
    title: 'Tables',
    description:
      'Review and adjust the tables we generated for each room — rename, adjust seats, or add more.',
  },
  menu: {
    title: 'Menu',
    description:
      'Add a few items to get started — you can bulk-import or add hundreds more anytime later.',
  },
  payment: {
    title: 'Payments',
    description:
      'How your customers will pay. Cash is added by default — add Card, UPI, or others your restaurant accepts.',
  },
  users: {
    title: 'Staff Accounts',
    description:
      "Add login accounts for your staff now, or skip this and add them later. We've suggested a starting cashier account below.",
  },
};

function classifyError(err: unknown): {
  type: 'duplicate' | 'network' | 'validation' | 'unknown';
  msg: string;
} {
  if (!err) {
    return {
      type: 'unknown',
      msg: 'An unknown error occurred.',
    };
  }

  // Network / fetch failure
  if (err instanceof TypeError) {
    return {
      type: 'network',
      msg: 'Network error, check your connection and retry.',
    };
  }

  // Parse Frappe _server_messages
  let serverMsg = '';

  if (
    typeof err === 'object' &&
    err !== null &&
    '_server_messages' in err
  ) {
    try {
      const parsed = JSON.parse((err as any)._server_messages);

      if (Array.isArray(parsed) && parsed.length > 0) {
        const inner =
          typeof parsed[0] === 'string'
            ? JSON.parse(parsed[0])
            : parsed[0];

        serverMsg = inner.message || '';
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Frappe DuplicateEntryError
  const excType: string = (err as any)?.exc_type ?? '';

  if (
    excType.includes('Duplicate') ||
    serverMsg.toLowerCase().includes('already exists')
  ) {
    return {
      type: 'duplicate',
      msg: 'Some records already exist and have been reused.',
    };
  }

  // Validation / mandatory field error
  if (
    serverMsg.toLowerCase().includes('mandatory') ||
    serverMsg.toLowerCase().includes('required')
  ) {
    return {
      type: 'validation',
      msg: serverMsg,
    };
  }

  const msg =
    serverMsg ||
    (typeof err === 'string' ? err : '') ||
    ((err as any)?.message ?? '') ||
    ((err as any)?.exception ?? '') ||
    'Failed to configure setup. Check backend logs.';

  return {
    type: 'unknown',
    msg,
  };
}

function ConfigurePageContent() {
  const navigate = useNavigate();

  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Keep the configure payload until ProgressModal confirms
  // that the realtime listener is ready.
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

    if (!payload) {
      return;
    }

    pendingFinish.current = null;

    try {
      await setupService.submitConfigureData(payload);

      // Setup is complete — the in-progress wizard snapshot must not
      // survive to a later setup attempt in the same tab/session.
      sessionStorage.removeItem('ury.setup.configureState');

      // Mark setup as complete in System Settings.
      await call('frappe.client.set_value', {
        doctype: 'System Settings',
        name: 'System Settings',
        fieldname: 'setup_complete',
        value: 1,
      });

      // Mark all steps done.
      setActiveIndex(CONFIGURE_PROGRESS_STEPS.length);

      setTimeout(() => {
        window.location.href = '/ury/dashboard';
      }, 800);
    } catch (err: unknown) {
      console.error('Failed to finish configure setup', err);

      const classified = classifyError(err);

      if (classified.type === 'duplicate') {
        // Duplicate records are non-fatal.
        // They already exist, so continue as if setup succeeded.
        console.warn(
          'Duplicate record warning (non-fatal):',
          classified.msg
        );

        setActiveIndex(CONFIGURE_PROGRESS_STEPS.length);

        setTimeout(() => {
          window.location.href = '/ury/dashboard';
        }, 800);

        return;
      }

      if (classified.type === 'network') {
        setError(
          'Network error, check your connection. Your data is preserved. Click "Finish with defaults" to retry.'
        );
      } else {
        setError(classified.msg);
      }

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

    // doConfigureApiCall() is triggered by ProgressModal's onReady
    // once the realtime listener is confirmed attached.
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

  const config =
    SECTION_CONFIGS[activeSection] || SECTION_CONFIGS.branch;

  return (
    <WizardLayout
      step={2}
      onPrev={handlePrev}
      onNext={handleNext}
      nextLabel={isLastSection ? 'Launch' : 'Next'}
      isNextLoading={finishing}
      secondaryAction={
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-xs text-muted-foreground">
            the data can be changed later
          </span>

          <Button
            type="button"
            variant="ghost"
            onClick={handleFinish}
            disabled={finishing}
          >
            Finish with defaults
          </Button>
        </div>
      }
    >
      <div className="space-y-4 h-full">
        {error && (
          <div className="p-4 bg-destructive-tint border border-destructive rounded-lg flex items-start gap-3 text-destructive">
            <div className="flex-1 text-sm font-medium">
              <span className="font-bold block mb-1">
                Configuration Error:
              </span>
              {error}
            </div>

            <button
              onClick={() => setError(null)}
              className="text-xs text-destructive hover:text-destructive font-semibold underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Sidebar + content — the page scrolls naturally now,
            no fixed-height card to bleed into */}
        <div className="flex flex-col md:flex-row gap-6 md:gap-8">
          <div className="w-full md:w-64 shrink-0 md:sticky md:top-8 md:self-start">
            <ConfigureSidebar />
          </div>

          <div className="flex-1 min-w-0">
            <SectionShell
              title={config.title}
              description={config.description}
            >
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