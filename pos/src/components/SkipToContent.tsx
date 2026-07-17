import { t } from '../i18n';

/**
 * Skip-to-content link for keyboard/screen reader accessibility.
 *
 * This component renders a hidden link that becomes visible when focused
 * (via Tab key), allowing keyboard users to skip the header/footer
 * navigation and jump directly to the main content area.
 *
 * Usage: Place at the very top of the App component, before any other UI.
 * The link target should match the `id` of your main content container.
 */
export function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
    >
      {t('common.skip_to_content') || 'Skip to content'}
    </a>
  );
}
