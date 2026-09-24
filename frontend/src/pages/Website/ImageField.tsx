import React, { useRef, useState } from 'react';
import { ImagePlus, Trash2, Loader2 } from 'lucide-react';
import { showToast } from '@ury/ui';
import { uploadImage } from '../../lib/uploadImage';
import { t } from '../../i18n';

interface ImageFieldProps {
  label: string;
  hint?: string;
  value: string | null;
  onChange: (url: string | null) => void;
  /** A wide box for covers, a square one for logos. */
  aspect?: 'wide' | 'square';
  disabled?: boolean;
}

/**
 * One image, uploaded by drop, by paste-free click, or by keyboard.
 *
 * The thumbnail is the point: a field that holds `/files/hero-final-2.jpg`
 * tells a manager nothing about which photo that is, which is how the wrong
 * cover ends up on a published page.
 */
export const ImageField: React.FC<ImageFieldProps> = ({
  label,
  hint,
  value,
  onChange,
  aspect = 'wide',
  disabled,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const accept = async (file: File | undefined) => {
    if (!file || disabled) return;
    if (!file.type.startsWith('image/')) {
      showToast({ message: t('dash.website.images.not_an_image'), type: 'error' });
      return;
    }
    setBusy(true);
    try {
      onChange(await uploadImage(file));
    } catch {
      showToast({ message: t('dash.website.images.upload_failed'), type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-busy={busy}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void accept(e.dataTransfer.files?.[0]);
        }}
        className={[
          'relative flex items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition-colors',
          aspect === 'wide' ? 'h-40 w-full' : 'h-28 w-28',
          dragging ? 'border-primary-500 bg-primary-50' : 'border-gray-300 bg-gray-50',
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-primary-400',
        ].join(' ')}
      >
        {value ? (
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1 px-3 text-center text-gray-500">
            <ImagePlus className="h-5 w-5" />
            <span className="text-xs">{t('dash.website.images.drop_here')}</span>
          </div>
        )}

        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <Loader2 className="h-5 w-5 animate-spin text-primary-600" />
          </div>
        )}

        {value && !disabled && (
          <button
            type="button"
            aria-label={t('dash.website.images.remove')}
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            className="absolute end-2 top-2 rounded-lg bg-white/90 p-1.5 text-red-600 shadow-sm hover:bg-white"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {hint && <p className="text-xs text-gray-500">{hint}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void accept(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
};
