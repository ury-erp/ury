import { Check, Languages } from 'lucide-react';
import { Button } from '@ury/ui';
import { t, getActiveLanguage, setLanguage } from '../i18n';
import { SUPPORTED_LANGUAGES } from '../i18n/config';

/**
 * Language picker rendered inside the header user menu.
 *
 * Each entry is labelled in its own language (العربية, Français) rather than
 * translated into the active locale — a cashier who has the POS stuck in a
 * language they don't read still needs to find their own.
 */
const LanguageSwitcher = () => {
  const activeLanguage = getActiveLanguage();

  return (
    <div className="border-t border-gray-200 pt-2 mt-1">
      <p className="px-4 pb-1 text-xs font-medium uppercase tracking-wide text-gray-400">
        {t('language.label')}
      </p>
      {Object.entries(SUPPORTED_LANGUAGES).map(([code, label]) => {
        const isActive = code === activeLanguage;
        return (
          <Button
            key={code}
            variant="ghost"
            aria-current={isActive ? 'true' : undefined}
            lang={code}
            className="flex justify-start items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            onClick={() => setLanguage(code)}
          >
            <Languages className="w-4 h-4 me-3 shrink-0" />
            <span className="flex-1 text-start">{label}</span>
            {isActive && <Check className="w-4 h-4 ms-2 shrink-0 text-primary" />}
          </Button>
        );
      })}
    </div>
  );
};

export default LanguageSwitcher;
