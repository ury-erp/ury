import React, { useCallback, useEffect, useState } from 'react';
import { Tags, Ticket, Sparkles, ExternalLink } from 'lucide-react';
import { Button, Badge, Spinner } from '@ury/ui';
import { formatCurrency } from '@ury/core';
import { LoadErrorBanner } from '../../components/common/LoadErrorBanner';
import { promotionsService, type OfferRule } from '../../services/promotions';
import { t } from '../../i18n';

/** What the rule takes off, in the words a cashier would use. */
function offerValue(rule: OfferRule): string {
  if (rule.rate_or_discount === 'Discount Percentage' && rule.discount_percentage) {
    return `${rule.discount_percentage}%`;
  }
  if (rule.discount_amount) return formatCurrency(rule.discount_amount);
  return t('dash.offers.see_rule');
}

const OfferCard: React.FC<{ rule: OfferRule; needsCode: boolean }> = ({ rule, needsCode }) => (
  <li className="rounded-xl border border-gray-200 bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p className="font-semibold text-gray-900">{rule.title || rule.name}</p>
        <p className="text-xs text-gray-500">
          {rule.apply_on}
          {rule.min_amt ? ` · ${t('dash.offers.min_amount', { amount: formatCurrency(rule.min_amt) })}` : ''}
          {rule.min_qty ? ` · ${t('dash.offers.min_qty', { count: String(rule.min_qty) })}` : ''}
        </p>
      </div>
      <Badge variant={needsCode ? 'warning' : 'success'}>{offerValue(rule)}</Badge>
    </div>

    <p className="mt-2 text-xs text-gray-500">
      {rule.valid_upto
        ? t('dash.offers.until', { date: rule.valid_upto })
        : t('dash.offers.no_end_date')}
    </p>

    <a
      href={`/app/pricing-rule/${encodeURIComponent(rule.name)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary-700"
    >
      <ExternalLink className="h-3.5 w-3.5" />
      {t('dash.offers.edit_rule')}
    </a>
  </li>
);

/**
 * What is running right now.
 *
 * The rules themselves are ERPNext Pricing Rules and are edited there — this
 * screen exists because a manager's question is never "show me the rule
 * table", it is "what is live tonight, and which of it does a guest have to
 * ask for".
 */
export const OffersPage: React.FC = () => {
  const [automatic, setAutomatic] = useState<OfferRule[]>([]);
  const [coupon, setCoupon] = useState<OfferRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const fetch = useCallback(async () => {
    try {
      const result = await promotionsService.active();
      setAutomatic(result.automatic ?? []);
      setCoupon(result.coupon ?? []);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void fetch();
  }, [fetch]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-gray-200 pb-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Tags className="h-5 w-5 text-primary" />
            {t('dash.offers.title')}
          </h1>
          <p className="text-sm text-gray-500">{t('dash.offers.subtitle')}</p>
        </div>
        <Button variant="outline" onClick={() => window.open('/app/pricing-rule/new', '_blank', 'noopener')}>
          {t('dash.offers.new_rule')}
        </Button>
      </div>

      {loadError && <LoadErrorBanner onRetry={() => void fetch()} />}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Sparkles className="h-4 w-4 text-green-600" />
              {t('dash.offers.automatic')}
            </h2>
            <p className="mb-3 text-xs text-gray-500">{t('dash.offers.automatic_hint')}</p>
            {automatic.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
                {t('dash.offers.none')}
              </p>
            ) : (
              <ul className="space-y-3">
                {automatic.map((rule) => (
                  <OfferCard key={rule.name} rule={rule} needsCode={false} />
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Ticket className="h-4 w-4 text-amber-600" />
              {t('dash.offers.coupon')}
            </h2>
            <p className="mb-3 text-xs text-gray-500">{t('dash.offers.coupon_hint')}</p>
            {coupon.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
                {t('dash.offers.none')}
              </p>
            ) : (
              <ul className="space-y-3">
                {coupon.map((rule) => (
                  <OfferCard key={rule.name} rule={rule} needsCode />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default OffersPage;
