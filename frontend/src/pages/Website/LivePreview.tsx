import React from 'react';
import { Monitor, Tablet, Smartphone, RefreshCw, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@ury/ui';
import { t } from '../../i18n';

export type PreviewDevice = 'phone' | 'tablet' | 'desktop';

/** Widths the page is actually laid out for; see restaurant-website.css. */
const DEVICE_WIDTH: Record<PreviewDevice, number> = {
  phone: 390,
  tablet: 820,
  desktop: 1280,
};

const DEVICE_ICON: Record<PreviewDevice, React.ElementType> = {
  phone: Smartphone,
  tablet: Tablet,
  desktop: Monitor,
};

interface LivePreviewProps {
  src: string;
  device: PreviewDevice;
  onDevice: (device: PreviewDevice) => void;
  onRefresh: () => void;
  openUrl?: string;
  syncing?: boolean;
}

/**
 * The page as it will be, beside the fields that make it.
 *
 * The iframe renders the real template through the real controller, not a
 * client-side imitation of it: a preview that is drawn by different code
 * from the published page is a preview of something else.
 */
export const LivePreview: React.FC<LivePreviewProps> = ({
  src,
  device,
  onDevice,
  onRefresh,
  openUrl,
  syncing,
}) => {
  const width = DEVICE_WIDTH[device];

  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-gray-100">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-3 py-2">
        <div className="flex items-center gap-1" role="group" aria-label={t('dash.website.preview.sizes')}>
          {(Object.keys(DEVICE_WIDTH) as PreviewDevice[]).map((name) => {
            const Icon = DEVICE_ICON[name];
            const active = device === name;
            return (
              <button
                key={name}
                type="button"
                aria-pressed={active}
                aria-label={t(`dash.website.preview.${name}`)}
                title={t(`dash.website.preview.${name}`)}
                onClick={() => onDevice(name)}
                className={[
                  'rounded-lg p-2 transition-colors',
                  active ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-800',
                ].join(' ')}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {syncing && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('dash.website.preview.syncing')}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4 me-1" />
            {t('dash.website.preview.refresh')}
          </Button>
          {openUrl && (
            <a
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-white"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t('dash.website.preview.open_tab')}
            </a>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        <div
          className="mx-auto h-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
          style={{ width, maxWidth: '100%' }}
        >
          <iframe
            key={src}
            src={src}
            title={t('dash.website.preview.title')}
            className="h-full w-full"
            style={{ minHeight: 640 }}
            /* The preview is our own page, but it renders manager-entered
               content, so it stays sandboxed: scripts yes (the booking panel
               needs them), same-origin no more than it already is. */
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        </div>
      </div>
    </div>
  );
};
