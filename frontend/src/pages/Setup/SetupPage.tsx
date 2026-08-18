import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { WizardLayout } from '../../components/setup/WizardLayout';
import { DynamicForm, DynamicFormHandle } from '../../components/setup/DynamicForm';
import { InstallationTypeCard } from '../../components/setup/InstallationTypeCard';
import { setupService } from '../../services/setup';
import setupSchema from '../../data/forms/setup.json';
import { PROGRESS_STEPS } from '../../components/setup/constants';

const ProgressModal = lazy(() => import('../../components/setup/ProgressModal').then(module => ({ default: module.ProgressModal })));

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

export default function SetupPage() {
  const navigate = useNavigate();
  const formRef = useRef<DynamicFormHandle>(null);
  
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, { value: string; label: string }[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [installationType, setInstallationType] = useState<'minimal' | 'advanced'>('minimal');

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

        const formattedLangs = rawLangs.map((l: any) => {
          if (typeof l === 'string') return { value: l, label: l };
          return { value: l.name || l.value, label: l.label || l.name || l.value };
        });

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

  const handleNext = async () => {
    if (!formRef.current?.validate()) {
      return;
    }
    
    setSubmitting(true);
    setError(null);
    setActiveIndex(0);
    
    const interval = setInterval(() => {
      setActiveIndex(i => Math.min(i + 1, PROGRESS_STEPS.length - 1));
    }, 3500);
    
    try {
      const payload = { ...formRef.current.getValues(), installation_type: installationType };
      await setupService.submitSetup(payload);
      
      clearInterval(interval);
      setActiveIndex(PROGRESS_STEPS.length);
      
      setTimeout(() => {
        if (installationType === 'minimal') {
          navigate('/setup-wizard/1');
        } else {
          window.location.href = '/app';
        }
      }, 800);
    } catch (err: any) {
      clearInterval(interval);
      setError(err?.message || 'An error occurred during setup');
      // Do not close modal on error, allow user to see the error message
    }
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
      </div>
      
      {submitting && (
        <Suspense fallback={null}>
          <ProgressModal visible={true} activeIndex={activeIndex} error={error} />
        </Suspense>
      )}
    </WizardLayout>
  );
}
