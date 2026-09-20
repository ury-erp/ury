import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@ury/ui';
import { WizardLayout } from '../../components/setup/WizardLayout';
import { ConfigureSidebar } from '../../components/setup/ConfigureSidebar';
import { SectionShell } from '../../components/setup/SectionShell';
import {
  ConfigureProvider,
  useConfigure,
  SECTION_ORDER,
} from '../../context/ConfigureContext';
import { BranchSection } from '../../components/setup/sections/BranchSection';
import { RoomSection } from '../../components/setup/sections/RoomSection';
import { TableSection } from '../../components/setup/sections/TableSection';
import { MenuSection } from '../../components/setup/sections/MenuSection';
import { PaymentSection } from '../../components/setup/sections/PaymentSection';
import { UserSection } from '../../components/setup/sections/UserSection';
import { setupService } from '../../services/setup';
import { parseFrappeError } from '@ury/core';
import { assertConfigureSuccess } from '../../lib/configureValidation';
import SideDrawer from '../../components/layout/SideDrawer';
import { CONFIGURE_PROGRESS_STEPS } from '../../components/setup/constants';
import { ProgressModal } from '../../components/setup/ProgressModal';
import { t } from '../../i18n';

function ConfigurePageContent() {
  const navigate = useNavigate();

  const [finishing, setFinishing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
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
    sectionValidity,
    setActiveSection,
    markSectionCompleted,
  } = useConfigure();

  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
      errorRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [error]);

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
      const result = await setupService.submitConfigureData(payload);
      assertConfigureSuccess(result);
      // The server owns setup_complete. Keep the draft until it confirms all work.
      try { sessionStorage.removeItem('ury.setup.configureState'); } catch { /* storage unavailable */ }

      // Mark all steps done.
      setActiveIndex(CONFIGURE_PROGRESS_STEPS.length);

      setTimeout(() => {
        window.location.href = '/ury/dashboard';
      }, 800);
    } catch (err: unknown) {
      console.error('Failed to finish configure setup', err);

      setError(`${t('setup.incomplete_result')} ${parseFrappeError(err, t('setup.retry_hint'))}`);

      setFinishing(false);
    }
  }, []);

  const handleFinish = () => {
    if (finishing) return;
    const invalidSection = SECTION_ORDER.find((section) => !sectionValidity[section]);
    if (invalidSection) {
      markSectionCompleted(invalidSection);
      setActiveSection(invalidSection);
      setError(t(`setup.validation.${invalidSection}`));
      return;
    }
    setError(null);
    setReviewing(true);
  };

  const submitConfiguration = () => {
    if (finishing) return;
    setReviewing(false);
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
    if (!sectionValidity[activeSection]) {
      markSectionCompleted();
      setError(t(`setup.validation.${activeSection}`));
      return;
    }
    setError(null);
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



  return (
    <WizardLayout
      step={2}
      onPrev={handlePrev}
      onNext={handleNext}
      nextLabel={t(isLastSection ? 'setup.review_launch' : 'setup.next')}
      isNextLoading={finishing}
      secondaryAction={
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-xs text-muted-foreground">
            {t('setup.change_later')}
          </span>

          <Button
            type="button"
            variant="ghost"
            onClick={handleFinish}
            disabled={finishing}
          >{t('setup.review_launch')}</Button>
        </div>
      }
    >
      <div className="space-y-4 h-full">
        {error && (
          <div ref={errorRef} tabIndex={-1} role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-red-700">
            <div className="flex-1 text-sm font-medium">
              <span className="font-bold block mb-1">{t('setup.config_error')}</span>
              {error}
            </div>

            <button
              onClick={() => setError(null)}
              className="text-xs text-red-500 hover:text-red-700 font-semibold underline shrink-0"
            >{t('dash.configure.dismiss')}</button>
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
              title={t(`setup.sections.${activeSection}.title`)}
              description={t(`setup.sections.${activeSection}.description`)}
            >
              {renderSection()}
            </SectionShell>
          </div>
        </div>
      </div>

      <SideDrawer isOpen={reviewing} onClose={() => setReviewing(false)} title={t('setup.review_launch')}>
        <p className="mb-4 text-sm text-muted-foreground">{t('setup.review_hint')}</p>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-3"><dt>{t('setup.sections.branch.title')}</dt><dd>{branch.branchName}</dd></div>
          {([
            ['rooms', rooms.length], ['tables', tables.length], ['menu', menuItems.length],
            ['payment', paymentMethods.length], ['users', users.length],
          ] as const).map(([section, count]) => (
            <div key={section} className="flex justify-between gap-3"><dt>{t(`setup.sections.${section}.title`)}</dt><dd>{count}</dd></div>
          ))}
        </dl>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setReviewing(false)}>{t('common.back')}</Button>
          <Button onClick={submitConfiguration} disabled={finishing}>{t('setup.launch')}</Button>
        </div>
      </SideDrawer>

      {finishing && (
        <ProgressModal
          visible={true}
          activeIndex={activeIndex}
          error={error}
          description={t('setup.progress_description')}
          steps={CONFIGURE_PROGRESS_STEPS.map((_, index) => t(`setup.progress.${index}`))}
          eventName="ury_configure_progress"
          onStepChange={(index) => setActiveIndex(Math.min(index, CONFIGURE_PROGRESS_STEPS.length - 1))}
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