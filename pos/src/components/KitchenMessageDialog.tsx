import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle,
  Button, Textarea, Field, showToast, cn,
} from '@ury/ui';
import { call } from '@ury/core';
import { AlertTriangle, Info, Send } from 'lucide-react';
import { t } from '../i18n';
import { usePOSStore } from '../store/pos-store';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Priority = 'Normal' | 'High' | 'Urgent';

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'Normal', label: 'kitchen_msg.priority_normal' },
  { value: 'High', label: 'kitchen_msg.priority_high' },
  { value: 'Urgent', label: 'kitchen_msg.priority_urgent' },
];

const EXPIRY_CHOICES = [15, 30, 60];

/**
 * Sends a real-time message from the floor to the kitchen display.
 *
 * The mandatory toggle is the important control, so it is a labelled block
 * with its consequence spelled out rather than a bare checkbox: turning it on
 * blocks every kitchen screen until a cook confirms, which is the right
 * behaviour for an allergy and the wrong one for "we're out of lemons".
 */
export default function KitchenMessageDialog({ open, onOpenChange }: Props) {
  const { posProfile } = usePOSStore();
  const branch = posProfile?.branch;

  const [message, setMessage] = useState('');
  const [station, setStation] = useState<string>('');
  const [priority, setPriority] = useState<Priority>('Normal');
  const [mandatory, setMandatory] = useState(false);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  const [stations, setStations] = useState<{ name: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !branch) return;
    // Reset per opening: a stale draft from the last order is worse than blank.
    setMessage('');
    setStation('');
    setPriority('Normal');
    setMandatory(false);
    setExpiresIn(null);
    setError(null);

    call
      .get<{ message: { name: string }[] }>(
        'ury.ury.api.ury_kitchen_message.get_stations',
        { branch },
      )
      .then((r) => setStations(r.message ?? []))
      .catch(() => setStations([]));
  }, [open, branch]);

  const send = async () => {
    const body = message.trim();
    if (!body) {
      setError(t('kitchen_msg.empty'));
      return;
    }
    if (!branch) return;

    setSending(true);
    setError(null);
    try {
      await call.post('ury.ury.api.ury_kitchen_message.send_message', {
        message: body,
        branch,
        production: station || null,
        requires_acknowledgement: mandatory ? 1 : 0,
        priority,
        expires_in_minutes: expiresIn,
      });
      showToast.success(t('kitchen_msg.sent'));
      onOpenChange(false);
    } catch (err) {
      console.error('kitchen message: send failed', err);
      setError(t('kitchen_msg.failed'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="large">
        <DialogHeader>
          <DialogTitle>{t('kitchen_msg.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          <Field label={t('kitchen_msg.message')} htmlFor="kmsg" required error={error ?? undefined}>
            <Textarea
              id="kmsg"
              rows={3}
              autoFocus
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('kitchen_msg.placeholder')}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('kitchen_msg.station')} htmlFor="kmsg-station">
              <select
                id="kmsg-station"
                value={station}
                onChange={(e) => setStation(e.target.value)}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm ring-focus"
              >
                <option value="">{t('kitchen_msg.all_stations')}</option>
                {stations.map((s) => (
                  <option key={s.name} value={s.name}>{s.name}</option>
                ))}
              </select>
            </Field>

            <Field label={t('kitchen_msg.priority')} htmlFor="kmsg-priority">
              <div className="flex gap-1.5" id="kmsg-priority" role="group">
                {PRIORITIES.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    aria-pressed={priority === p.value}
                    onClick={() => setPriority(p.value)}
                    className={cn(
                      'h-11 flex-1 rounded-md border text-sm font-medium press transition-colors duration-fast',
                      priority === p.value
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-background hover:bg-muted',
                    )}
                  >
                    {t(p.label)}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          {/* The consequential choice, given its own weight. */}
          <div
            className={cn(
              'rounded-lg border p-4 transition-colors duration-fast',
              mandatory ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-muted/30',
            )}
          >
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={mandatory}
                onChange={(e) => setMandatory(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(var(--destructive))]"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  {mandatory
                    ? <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />
                    : <Info className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                  {t('kitchen_msg.mandatory')}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  {mandatory ? t('kitchen_msg.mandatory_hint') : t('kitchen_msg.optional_hint')}
                </span>
              </span>
            </label>
          </div>

          {/* A blocking message must not expire on its own — it would clear
              itself before anyone read it, which defeats the point. */}
          {!mandatory && (
            <Field label={t('kitchen_msg.expires')} htmlFor="kmsg-expiry">
              <div className="flex flex-wrap gap-1.5" id="kmsg-expiry" role="group">
                <button
                  type="button"
                  aria-pressed={expiresIn === null}
                  onClick={() => setExpiresIn(null)}
                  className={cn(
                    'h-9 rounded-md border px-3 text-xs font-medium press transition-colors duration-fast',
                    expiresIn === null
                      ? 'border-primary bg-primary-50 text-primary-700'
                      : 'border-input bg-background hover:bg-muted',
                  )}
                >
                  {t('kitchen_msg.expires_never')}
                </button>
                {EXPIRY_CHOICES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={expiresIn === m}
                    onClick={() => setExpiresIn(m)}
                    className={cn(
                      'h-9 rounded-md border px-3 text-xs font-medium press transition-colors duration-fast',
                      expiresIn === m
                        ? 'border-primary bg-primary-50 text-primary-700'
                        : 'border-input bg-background hover:bg-muted',
                    )}
                  >
                    {t('kitchen_msg.minutes', { count: m })}
                  </button>
                ))}
              </div>
            </Field>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={send} loading={sending} loadingText={t('kitchen_msg.sending')}>
            <Send className="h-4 w-4" aria-hidden="true" />
            {t('kitchen_msg.send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
