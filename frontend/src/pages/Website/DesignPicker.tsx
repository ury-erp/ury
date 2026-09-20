import React from 'react';
import { Check } from 'lucide-react';
import { t } from '../../i18n';

/**
 * The same colours the public stylesheet defines for each theme, so the
 * swatch a manager picks from is the page they will get rather than an
 * approximation of it. Keep in sync with `restaurant-website.css`.
 */
const THEME_SWATCHES: Record<string, { ink: string; accent: string; paper: string }> = {
  Olive: { ink: '#253d33', accent: '#b77948', paper: '#faf8f2' },
  Terracotta: { ink: '#653b30', accent: '#a95132', paper: '#fbf5ee' },
  Midnight: { ink: '#25384c', accent: '#8b643b', paper: '#f6f7f8' },
};

/** A miniature of what each layout does with the same content. */
const LAYOUT_SHAPES: Record<string, React.ReactNode> = {
  Classic: (
    <div className="flex h-full gap-1">
      <div className="flex flex-1 flex-col justify-center gap-1">
        <span className="h-1 w-3/4 rounded bg-current opacity-70" />
        <span className="h-1 w-1/2 rounded bg-current opacity-40" />
      </div>
      <div className="h-full flex-1 rounded-sm bg-current opacity-20" />
    </div>
  ),
  Centered: (
    <div className="flex h-full flex-col items-center justify-center gap-1">
      <span className="h-1 w-2/3 rounded bg-current opacity-70" />
      <span className="h-1 w-1/2 rounded bg-current opacity-40" />
      <span className="mt-1 h-3 w-4/5 rounded-sm bg-current opacity-20" />
    </div>
  ),
  Editorial: (
    <div className="flex h-full gap-1">
      <div className="h-full flex-[1.2] rounded-sm bg-current opacity-20" />
      <div className="flex flex-1 flex-col justify-center gap-1">
        <span className="h-1 w-full rounded bg-current opacity-70" />
        <span className="h-1 w-2/3 rounded bg-current opacity-40" />
      </div>
    </div>
  ),
};

interface DesignPickerProps {
  themes: string[];
  layouts: string[];
  theme: string;
  layout: string;
  onTheme: (value: string) => void;
  onLayout: (value: string) => void;
  disabled?: boolean;
}

export const DesignPicker: React.FC<DesignPickerProps> = ({
  themes,
  layouts,
  theme,
  layout,
  onTheme,
  onLayout,
  disabled,
}) => (
  <div className="space-y-6">
    <div>
      <h3 className="mb-3 text-sm font-semibold text-gray-800">
        {t('dash.website.design.theme')}
      </h3>
      <div className="grid grid-cols-3 gap-3">
        {themes.map((name) => {
          const swatch = THEME_SWATCHES[name] ?? THEME_SWATCHES.Olive;
          const active = theme === name;
          return (
            <button
              key={name}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onTheme(name)}
              className={[
                'relative overflow-hidden rounded-xl border-2 p-3 text-start transition-all',
                active ? 'border-primary-600 shadow-sm' : 'border-gray-200 hover:border-gray-300',
                disabled ? 'cursor-not-allowed opacity-60' : '',
              ].join(' ')}
              style={{ background: swatch.paper }}
            >
              <span className="flex gap-1.5">
                <span className="h-6 w-6 rounded-full" style={{ background: swatch.ink }} />
                <span className="h-6 w-6 rounded-full" style={{ background: swatch.accent }} />
              </span>
              <span className="mt-2 block text-xs font-semibold" style={{ color: swatch.ink }}>
                {t(`dash.website.design.themes.${name.toLowerCase()}`)}
              </span>
              {active && (
                <Check
                  className="absolute end-2 top-2 h-4 w-4"
                  style={{ color: swatch.accent }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>

    <div>
      <h3 className="mb-3 text-sm font-semibold text-gray-800">
        {t('dash.website.design.layout')}
      </h3>
      <div className="grid grid-cols-3 gap-3">
        {layouts.map((name) => {
          const active = layout === name;
          return (
            <button
              key={name}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onLayout(name)}
              className={[
                'rounded-xl border-2 p-3 text-start transition-all',
                active
                  ? 'border-primary-600 bg-primary-50 text-primary-900'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
                disabled ? 'cursor-not-allowed opacity-60' : '',
              ].join(' ')}
            >
              <span className="block h-10">{LAYOUT_SHAPES[name]}</span>
              <span className="mt-2 block text-xs font-semibold">
                {t(`dash.website.design.layouts.${name.toLowerCase()}`)}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-gray-500">{t('dash.website.design.hint')}</p>
    </div>
  </div>
);
