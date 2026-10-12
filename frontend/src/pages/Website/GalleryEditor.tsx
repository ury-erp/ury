import React, { useRef, useState } from 'react';
import { ImagePlus, Trash2, GripVertical, Loader2 } from 'lucide-react';
import { Input, showToast } from '@ury/ui';
import { uploadImage } from '../../lib/uploadImage';
import type { GalleryRow } from '../../services/website';
import { t } from '../../i18n';

interface GalleryEditorProps {
  value: GalleryRow[];
  max: number;
  onChange: (rows: GalleryRow[]) => void;
  disabled?: boolean;
}

/** Move one item without mutating the array the caller still holds. */
function reorder(rows: GalleryRow[], from: number, to: number): GalleryRow[] {
  const next = rows.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export const GalleryEditor: React.FC<GalleryEditorProps> = ({ value, max, onChange, disabled }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length || disabled) return;
    const room = max - value.length;
    if (room <= 0) {
      showToast({ message: t('dash.website.gallery.full'), type: 'error' });
      return;
    }

    setBusy(true);
    const added: GalleryRow[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        added.push({ image: await uploadImage(file), caption: '' });
      } catch {
        showToast({ message: t('dash.website.images.upload_failed'), type: 'error' });
      }
    }
    setBusy(false);
    if (added.length) onChange([...value, ...added]);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {value.map((row, index) => (
          <div
            key={`${row.image}-${index}`}
            draggable={!disabled}
            onDragStart={() => setDragFrom(index)}
            onDragOver={(e) => {
              e.preventDefault();
              setDropTarget(index);
            }}
            onDragEnd={() => {
              setDragFrom(null);
              setDropTarget(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom !== null && dragFrom !== index) onChange(reorder(value, dragFrom, index));
              setDragFrom(null);
              setDropTarget(null);
            }}
            className={[
              'overflow-hidden rounded-xl border bg-white transition-colors',
              dropTarget === index && dragFrom !== index ? 'border-primary-500' : 'border-gray-200',
            ].join(' ')}
          >
            <div className="relative">
              <img src={row.image} alt="" className="h-28 w-full object-cover" />
              <span className="absolute start-2 top-2 rounded-md bg-white/90 p-1 text-gray-500">
                <GripVertical className="h-3.5 w-3.5" />
              </span>
              {!disabled && (
                <button
                  type="button"
                  aria-label={t('dash.website.images.remove')}
                  onClick={() => onChange(value.filter((_, i) => i !== index))}
                  className="absolute end-2 top-2 rounded-md bg-white/90 p-1 text-red-600 hover:bg-white"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Input
              className="rounded-none border-0 border-t border-gray-100 text-xs"
              placeholder={t('dash.website.gallery.caption')}
              value={row.caption}
              disabled={disabled}
              onChange={(e) =>
                onChange(
                  value.map((item, i) => (i === index ? { ...item, caption: e.target.value } : item)),
                )
              }
            />
          </div>
        ))}

        <button
          type="button"
          disabled={disabled || busy || value.length >= max}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void addFiles(e.dataTransfer.files);
          }}
          className="flex h-[10.5rem] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 text-gray-500 hover:border-primary-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          <span className="px-2 text-center text-xs">{t('dash.website.gallery.add')}</span>
        </button>
      </div>

      <p className="text-xs text-gray-500">
        {t('dash.website.gallery.hint', { count: String(max) })}
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
};
