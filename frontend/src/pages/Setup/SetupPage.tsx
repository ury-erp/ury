import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { WizardLayout } from '../../components/setup/WizardLayout';
import { DynamicForm, DynamicFormHandle } from '../../components/setup/DynamicForm';
import { InstallationTypeCard } from '../../components/setup/InstallationTypeCard';
import { setupService, SetupPayload } from '../../services/setup';
import setupSchema from '../../data/forms/setup.json';
import { ProgressModal } from '../../components/setup/ProgressModal';
import { Switch } from '../../components/ui/switch';

const FISCAL_YEARS: Record<string, string> = {
  Afghanistan: '12-21',
  Australia: '07-01',
  Bangladesh: '07-01',
  'Costa Rica': '10-01',
  Egypt: '07-01',
  Ethiopia: '07-08',
  'Hong Kong': '04-01',
  India: '04-01',
  Iran: '06-23',
  Kenya: '07-01',
  Malaysia: '07-01',
  Myanmar: '04-01',
  Nepal: '07-16',
  'New Zealand': '04-01',
  Pakistan: '07-01',
  Singapore: '04-01',
  'South Africa': '03-01',
  Thailand: '10-01',
  'United Kingdom': '04-01',
};

function calculateFyStartDate(country: string): string {
  const currentYear = new Date().getFullYear();
  const mmdd = FISCAL_YEARS[country] || '01-01';
  return `${currentYear}-${mmdd}`;
}

type PendingSubmit = {
  payload: SetupPayload;
  installationType: 'minimal' | 'advanced';
};

export default function SetupPage() {
  const navigate = useNavigate();
  const formRef = useRef<DynamicFormHandle>(null);
  
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, { value: string; label: string }[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [installationType, setInstallationType] = useState<'minimal' | 'advanced'>('minimal');
  const [setupUryDemo, setSetupUryDemo] = useState(false);
  const [progressSteps, setProgressSteps] = useState<string[]>([]);
  const pendingSubmit = useRef<PendingSubmit | null>(null);
  const finishedRef = useRef(false);

  useEffect(() => {
    async function loadDefaults() {
      try {
        const [defaults] = await Promise.all([
          setupService.getDefaults(),
        ]);
        
        if (!defaults) return;

        const rawLangs = Array.isArray(defaults.languages)
          ? defaults.languages
          : (defaults.languages as any)?.languages || [];

        const formattedLangs = rawLangs
          .map((l: any) => {
            const val = typeof l === 'string' ? l : (l.name || l.value || l.label);
            if (val === 'English') return { value: 'English', label: 'English' };
            if (val === 'العربية' || val === 'Arabic') return { value: 'Arabic', label: 'عربي' };
            if (val === 'Français' || val === 'French') return { value: 'French', label: 'français' };
            return null;
          })
          .filter(Boolean) as { value: string; label: string }[];

        const rawCountries = Array.isArray(defaults.countries) ? defaults.countries : [];
        const formattedCountries = rawCountries.map((c: any) =>
          typeof c === 'string' ? { value: c, label: c } : c
        );

        const rawCurrencies = Array.isArray(defaults.currencies) ? defaults.currencies : [];
        const formattedCurrencies = rawCurrencies.map((c: any) =>
          typeof c === 'string' ? { value: c, label: c } : c
        );

        const rawTimezones = Array.isArray(defaults.timezones) ? defaults.timezones : [];
        const formattedTimezones = rawTimezones.map((t: any) =>
          typeof t === 'string' ? { value: t, label: t } : t
        );

        setDynamicOptions(prev => ({
          ...prev,
          languages: formattedLangs,
          countries: formattedCountries,
          currencies: formattedCurrencies,
          timezones: formattedTimezones
        }));
        
        const defaultLanguage = (defaults.languages as any)?.default_language || 'English';
        formRef.current?.setFieldValue('language', defaultLanguage);

        const countryToUse = defaults.detected_country || 'India';
        formRef.current?.setFieldValue('country', countryToUse);
        await handleCountryChange(countryToUse);
      } catch (err) {
        console.error("Failed to load setup defaults", err);
      }
    }
    loadDefaults();
  }, []);

  const handleCountryChange = useCallback(async (country: string) => {
    try {
      const defaults = await setupService.getCountryDefaults(country);
      if (!defaults) return;

      const rawCharts = Array.isArray(defaults.charts_of_accounts) ? defaults.charts_of_accounts : [];
      const formattedCharts = rawCharts.map((chart: any) =>
        typeof chart === 'string' ? { value: chart, label: chart } : chart
      );

      setDynamicOptions(prev => ({
        ...prev,
        charts_of_accounts: formattedCharts
      }));
      
      if (defaults.timezone) formRef.current?.setFieldValue('timezone', defaults.timezone);
      if (defaults.currency) formRef.current?.setFieldValue('currency', defaults.currency);
      if (formattedCharts[0]?.value) {
        formRef.current?.setFieldValue('chart_of_accounts', formattedCharts[0].value);
      }

      const fyStartDate = calculateFyStartDate(country);
      formRef.current?.setFieldValue('fy_start_date', fyStartDate);
    } catch (err) {
      console.error("Failed to load country defaults", err);
    }
  }, []);

  const handleCompanyNameChange = useCallback((name: string) => {
    const abbr = name
      .split(' ')
      .map(w => w[0])
      .join('')
      .toUpperCase()
      .trim()
      .substring(0, 5);
      
    formRef.current?.setFieldValue('company_abbr', abbr);
  }, []);

  const handleFieldChange = useCallback((fieldId: string, value: string) => {
    if (fieldId === 'country') {
      handleCountryChange(value);
    } else if (fieldId === 'company_name') {
      handleCompanyNameChange(value);
    }
  }, [handleCountryChange, handleCompanyNameChange]);

  const finishSetup = useCallback((pending: PendingSubmit) => {
    if (finishedRef.current) return;
    finishedRef.current = true;

    setActiveIndex((current) => Math.max(current, progressSteps.length));

    setTimeout(() => {
      if (pending.payload.setup_ury_demo) {
        window.location.href = '/ury/dashboard';
      } else if (pending.installationType === 'minimal') {
        navigate('/setup-wizard/1');
      } else {
        window.location.href = '/app';
      }
    }, 800);
  }, [navigate, progressSteps.length]);

  const doApiCall = useCallback(async () => {
    const pending = pendingSubmit.current;
    if (!pending) return;

    try {
      const result = await setupService.submitSetup(pending.payload);
      // Background setup returns "registered" and finishes via setup_task.
      if (result && typeof result === 'object' && result.status === 'registered') {
        return;
      }
      finishSetup(pending);
    } catch (err: any) {
      setError(err?.message || 'An error occurred during setup');
      setSubmitting(false);
    }
  }, [finishSetup]);

  const handleSetupComplete = useCallback(() => {
    if (pendingSubmit.current) {
      finishSetup(pendingSubmit.current);
    }
  }, [finishSetup]);

  const handleSetupFail = useCallback((message: string) => {
    setError(message);
    setSubmitting(false);
  }, []);

  const handleNext = async () => {
    if (!formRef.current?.validate()) {
      return;
    }

    const payload: SetupPayload = {
      ...formRef.current.getValues(),
      installation_type: installationType,
      setup_ury_demo: setupUryDemo,
    };

    try {
      const steps = await setupService.getProgressSteps(setupUryDemo);
      setProgressSteps(
        steps.length
          ? steps.map((step) => step.status)
          : ['Setting up your restaurant']
      );
    } catch (err) {
      console.error('Failed to load setup stages', err);
      setProgressSteps(['Setting up your restaurant']);
    }

    finishedRef.current = false;
    pendingSubmit.current = { payload, installationType };
    setSubmitting(true);
    setError(null);
    setActiveIndex(0);
  };

  return (
    <WizardLayout
      step={1}
      onNext={handleNext}
      nextLabel="Continue"
      isNextDisabled={submitting}
    >
      <div className="space-y-8">
        <DynamicForm 
          ref={formRef} 
          schema={setupSchema} 
          optionsMap={dynamicOptions} 
          onFieldChange={handleFieldChange} 
        />
        
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">Installation Type</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {setupSchema.installationTypes?.map((type: any) => (
              <InstallationTypeCard 
                key={type.id} 
                type={type} 
                selected={installationType === type.id}
                onSelect={() => setInstallationType(type.id as 'minimal' | 'advanced')}
              />
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border p-4 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <label htmlFor="setup-ury-demo" className="text-sm font-semibold text-foreground cursor-pointer">
              Set up with demo data
            </label>
            <p className="text-sm text-muted-foreground">
              Adds a sample branch, rooms, tables, menu, and POS you can change or delete later.
            </p>
          </div>
          <Switch
            id="setup-ury-demo"
            checked={setupUryDemo}
            onCheckedChange={(checked) => setSetupUryDemo(checked === true)}
            disabled={submitting}
          />
        </div>
      </div>
      
      {submitting && (
        <ProgressModal 
          visible={true} 
          activeIndex={activeIndex}
          error={error}
          steps={progressSteps}
          eventName="setup_task"
          description={
            setupUryDemo
              ? 'This can take a few minutes if demo data is on.'
              : 'Setting things up, this usually takes less than a minute.'
          }
          onStepChange={setActiveIndex}
          onReady={doApiCall}
          onComplete={handleSetupComplete}
          onFail={handleSetupFail}
        />
      )}
    </WizardLayout>
  );
}
