import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { call } from '@ury/core';
// @ts-ignore
import { showToast } from '@ury/ui';
import { CONFIGURE_PROGRESS_STEPS } from '../../components/setup/constants';
import { ProgressModal } from '../../components/setup/ProgressModal';

const SECTION_CONFIGS: Record<SectionId, { title: string; description: string }> = {
  branch: {
    title: 'Branch Details',
    description: 'Set up your main branch name, invoice series prefixes, and tax details.',
  },
  rooms: {
    title: 'Dining Rooms',
    description: 'Configure dining areas and room types for your restaurant.',
  },
  tables: {
    title: 'Tables Setup',
    description: 'Define table numbers, seating capacities, and room assignments.',
  },
  menu: {
    title: 'Menu Configuration',
    description: 'Add menu items manually or upload a menu file template.',
  },
  payment: {
    title: 'Modes of Payment',
    description: 'Configure accepted payment methods at checkout.',
  },
  users: {
    title: 'User Accounts',
    description: 'Set up initial staff accounts and role assignments.',
  },
};

function ConfigurePageContent() {
  const navigate = useNavigate();
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

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

  const handleFinish = async () => {
    setFinishing(true);
    setError(null);
    setActiveIndex(0);

    const interval = setInterval(() => {
      setActiveIndex(i => Math.min(i + 1, CONFIGURE_PROGRESS_STEPS.length - 1));
    }, 2000);

    try {
      const payload = {
        branch,
        rooms,
        tables,
        menuItems,
        taxConfig,
        paymentMethods,
        users,
      };

      await setupService.submitConfigureData(payload);

      await call('frappe.client.set_value', {
        doctype: 'System Settings',
        name: 'System Settings',
        fieldname: 'setup_complete',
        value: 1,
      });

      clearInterval(interval);
      setActiveIndex(CONFIGURE_PROGRESS_STEPS.length);

      setTimeout(() => {
        window.location.href = '/ury/dashboard';
      }, 800);
    } catch (err: any) {
      clearInterval(interval);
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
      showToast.error(msg);
      setError(msg);
      setFinishing(false);
    }
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
    >
      <div className="space-y-4 h-full">
        {/* Two-Column Grid Layout */}
        <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-[#E5E7EB] -my-8 -mx-8 h-full">
          <div className="w-full md:w-64 shrink-0 p-6 md:py-8 md:pl-8 md:pr-6 h-full overflow-y-auto">
            <ConfigureSidebar />
          </div>

          <div className="flex-1 min-w-0 p-6 md:p-8 h-full overflow-y-auto">
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
