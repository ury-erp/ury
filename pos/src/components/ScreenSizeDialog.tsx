import { Monitor, Smartphone, ExternalLink } from 'lucide-react';
import { Button } from '@ury/ui';
import { t } from '../i18n';
import { POS_MIN_WIDTH } from '../hooks/useViewport';

/**
 * Shown only on phones now that tablets have their own layouts (UX-06).
 *
 * The body text used to be hardcoded English inside an otherwise translated
 * app, and it named 1024px — a number that is no longer the rule (UX-10).
 * Both the copy and the width come from one place here.
 */
const ScreenSizeDialog = () => {
  const handleSwitchToVersion1 = () => {
    window.open(`${window.location.origin}/urypos`, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="screen-size-title"
        className="bg-white rounded-lg p-8 max-w-md w-full shadow-xl"
      >
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 mb-6">
            <div className="relative">
              <Monitor className="h-8 w-8 text-blue-600" />
              <Smartphone className="h-4 w-4 text-red-500 absolute -top-1 -end-1" />
            </div>
          </div>

          <h2 id="screen-size-title" className="text-2xl font-bold text-gray-900 mb-4">
            {t('screen_size.desktop_only')}
          </h2>

          <div className="text-gray-600 mb-8 space-y-3">
            <p className="text-lg">{t('screen_size.built_for')}</p>
            <p className="text-sm">{t('screen_size.phone_alternative', { width: POS_MIN_WIDTH })}</p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-600">
              {t('screen_size.current_width')}
              <span className="font-semibold text-gray-800"> {window.innerWidth}px</span>
            </p>
            <p className="text-sm text-gray-600">
              {t('screen_size.required')}
              <span className="font-semibold text-gray-800"> {POS_MIN_WIDTH}px</span>
            </p>
          </div>

          <div className="bg-blue-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800 mb-3">{t('screen_size.use_v1_mobile')}</p>
            <Button
              onClick={handleSwitchToVersion1}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200 text-sm"
            >
              <ExternalLink className="w-4 h-4 me-2" />
              {t('screen_size.switch_v1')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScreenSizeDialog;
