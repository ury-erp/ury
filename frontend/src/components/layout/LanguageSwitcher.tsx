import React from 'react';
import { Check, Languages } from 'lucide-react';
import { t, getActiveLanguage, setLanguage } from '../../i18n';
import { SUPPORTED_LANGUAGES } from '../../i18n/config';

/**
 * Language picker for the dashboard header user menu.
 *
 * Entries are labelled in their own language rather than translated into the
 * active locale, so a user who cannot read the current UI can still find
 * theirs.
 */
export const LanguageSwitcher: React.FC = () => {
  const active = getActiveLanguage();

  return (
    <div className="border-t border-gray-200 pt-2 mt-1">
      <p className="px-4 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
        {t('language.label')}
      </p>
      {Object.entries(SUPPORTED_LANGUAGES).map(([code, label]) => {
        const isActive = code === active;
        return (
          <button
            key={code}
            lang={code}
            aria-current={isActive ? 'true' : undefined}
            onClick={() => setLanguage(code)}
            className="w-full flex items-center justify-between px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <span className="flex items-center gap-3">
              <Languages className="w-4 h-4 shrink-0" />
              <span>{label}</span>
            </span>
            {isActive && <Check className="w-4 h-4 text-primary shrink-0" />}
          </button>
        );
      })}
    </div>
  );
};

export default LanguageSwitcher;
