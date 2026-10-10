import React, { useCallback, useEffect, useState } from 'react';
import { MessageSquareHeart, Star, QrCode, Copy, Check, Phone, AlertTriangle } from 'lucide-react';
import { Button, Badge, Textarea, Spinner, showToast } from '@ury/ui';
import { parseFrappeError } from '@ury/core';
import { useBranchContext } from '../../context/BranchContext';
import SideDrawer from '../../components/layout/SideDrawer';
import { LoadErrorBanner } from '../../components/common/LoadErrorBanner';
import {
  feedbackService,
  type FeedbackRow,
  type FeedbackSummary,
} from '../../services/feedback';
import { t } from '../../i18n';

/** Filled stars up to the score, hollow after it — readable at a glance in a list. */
const Stars: React.FC<{ value: number | null; max?: number }> = ({ value, max = 5 }) => {
  if (!value) return <span className="text-gray-400">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value}/${max}`}>
      {Array.from({ length: max }, (_, index) => (
        <Star
          key={index}
          className={`h-3.5 w-3.5 ${index < value ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`}
        />
      ))}
    </span>
  );
};

const STATUS_TONE: Record<string, 'pending' | 'warning' | 'success'> = {
  New: 'pending',
  Acknowledged: 'warning',
  Resolved: 'success',
};

export const FeedbackPage: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [summary, setSummary] = useState<FeedbackSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<string>('');
  const [cardOpen, setCardOpen] = useState(false);
  const [card, setCard] = useState<{ url: string; svg: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [active, setActive] = useState<FeedbackRow | null>(null);
  const [notes, setNotes] = useState('');

  const fetch = useCallback(async () => {
    try {
      const [list, stats] = await Promise.all([
        feedbackService.list(filter ? { status: filter } : {}),
        feedbackService.summary(),
      ]);
      setRows(list ?? []);
      setSummary(stats);
      setLoadError(false);
    } catch {
      // Silence here would read as "no complaints today", which is the one
      // conclusion a manager must never draw from a broken request.
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    void fetch();
  }, [fetch, activeBranchId]);

  const openCard = async () => {
    setCardOpen(true);
    try {
      setCard(await feedbackService.card());
    } catch (error) {
      showToast.error(parseFrappeError(error, t('dash.feedback.card_failed')));
    }
  };

  const copyLink = async () => {
    if (!card?.url) return;
    try {
      await navigator.clipboard.writeText(card.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast.error(t('dash.feedback.copy_failed'));
    }
  };

  const save = async (status: string) => {
    if (!active) return;
    try {
      await feedbackService.setStatus(active.name, status, notes);
      setActive(null);
      setNotes('');
      await fetch();
    } catch (error) {
      showToast.error(parseFrappeError(error, t('dash.feedback.save_failed')));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-gray-200 pb-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <MessageSquareHeart className="h-5 w-5 text-primary" />
            {t('dash.feedback.title')}
          </h1>
          <p className="text-sm text-gray-500">{t('dash.feedback.subtitle')}</p>
        </div>
        <Button variant="outline" onClick={openCard}>
          <QrCode className="me-2 h-4 w-4" />
          {t('dash.feedback.get_card')}
        </Button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-xs text-gray-500">{t('dash.feedback.stats.responses')}</p>
            <p className="text-lg font-bold text-gray-900">{summary.responses}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-xs text-gray-500">{t('dash.feedback.stats.overall')}</p>
            <p className="flex items-center gap-2 text-lg font-bold text-gray-900">
              {summary.averages.overall ?? '—'}
              <Stars value={Math.round(summary.averages.overall ?? 0)} max={summary.max_stars} />
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-xs text-gray-500">{t('dash.feedback.stats.nps')}</p>
            <p className="text-lg font-bold text-gray-900">
              {summary.nps === null ? t('dash.feedback.not_asked_yet') : summary.nps}
            </p>
          </div>
          <div
            className={`rounded-xl border p-3 ${
              summary.unanswered_detractors > 0
                ? 'border-red-200 bg-red-50'
                : 'border-gray-200 bg-white'
            }`}
          >
            <p className="text-xs text-gray-500">{t('dash.feedback.stats.unanswered')}</p>
            <p
              className={`text-lg font-bold ${
                summary.unanswered_detractors > 0 ? 'text-red-700' : 'text-gray-900'
              }`}
            >
              {summary.unanswered_detractors}
            </p>
          </div>
        </div>
      )}

      {summary && summary.awaiting_contact > 0 && (
        <p className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <Phone className="h-4 w-4 shrink-0" />
          {t('dash.feedback.awaiting_contact', { count: String(summary.awaiting_contact) })}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {['', 'New', 'Acknowledged', 'Resolved'].map((value) => (
          <Button
            key={value || 'all'}
            size="sm"
            variant={filter === value ? 'default' : 'outline'}
            onClick={() => setFilter(value)}
          >
            {value ? t(`dash.feedback.statuses.${value.toLowerCase()}`) : t('dash.feedback.all')}
          </Button>
        ))}
      </div>

      {loadError && <LoadErrorBanner onRetry={() => void fetch()} />}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-500">{t('dash.feedback.empty')}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.name}
              className={`rounded-xl border bg-white p-4 ${
                row.overall <= 2 ? 'border-red-200' : 'border-gray-200'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Stars value={row.overall} />
                    <Badge variant={STATUS_TONE[row.status] ?? 'outline'}>
                      {t(`dash.feedback.statuses.${row.status.toLowerCase()}`)}
                    </Badge>
                    {row.overall <= 2 && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {t('dash.feedback.needs_attention')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    {row.submitted_at?.slice(0, 16)}
                    {row.restaurant_table ? ` · ${row.restaurant_table}` : ''}
                    {row.invoice ? ` · ${row.invoice}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
                  <span>
                    {t('dash.feedback.food')} <Stars value={row.food} />
                  </span>
                  <span>
                    {t('dash.feedback.service')} <Stars value={row.service} />
                  </span>
                  <span>
                    {t('dash.feedback.cleanliness')} <Stars value={row.cleanliness} />
                  </span>
                </div>
              </div>

              {row.comment && (
                <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-800">“{row.comment}”</p>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                {row.contact_number ? (
                  <a
                    href={`tel:${row.contact_number}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-primary-700"
                    dir="ltr"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {row.contact_number}
                  </a>
                ) : (
                  <span />
                )}
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    setActive(row);
                    setNotes(row.follow_up_notes ?? '');
                  }}
                >
                  {t('dash.feedback.follow_up')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <SideDrawer isOpen={cardOpen} onClose={() => setCardOpen(false)} title={t('dash.feedback.get_card')}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{t('dash.feedback.card_hint')}</p>
          {card?.svg ? (
            <div
              className="mx-auto w-48 [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: card.svg }}
            />
          ) : (
            <p className="text-sm text-gray-500">{t('dash.feedback.no_qr')}</p>
          )}
          {card?.url && (
            <div className="space-y-2">
              <p className="break-all rounded-lg bg-gray-50 p-3 text-xs text-gray-700" dir="ltr">
                {card.url}
              </p>
              <Button fullWidth variant="outline" onClick={copyLink}>
                {copied ? <Check className="me-2 h-4 w-4" /> : <Copy className="me-2 h-4 w-4" />}
                {copied ? t('dash.feedback.copied') : t('dash.feedback.copy')}
              </Button>
            </div>
          )}
        </div>
      </SideDrawer>

      <SideDrawer
        isOpen={Boolean(active)}
        onClose={() => setActive(null)}
        title={t('dash.feedback.follow_up')}
      >
        <div className="space-y-4">
          {active?.comment && (
            <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-800">“{active.comment}”</p>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">
              {t('dash.feedback.follow_up_notes')}
            </label>
            <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button fullWidth variant="outline" onClick={() => save('Acknowledged')}>
              {t('dash.feedback.statuses.acknowledged')}
            </Button>
            <Button fullWidth onClick={() => save('Resolved')}>
              {t('dash.feedback.statuses.resolved')}
            </Button>
          </div>
        </div>
      </SideDrawer>
    </div>
  );
};

export default FeedbackPage;
