import { useEffect, useState } from 'react';
import { Select, SelectItem } from '@ury/ui';
import { canOrderOnBehalf } from '@ury/core';

import { listEligiblePerformers, type EligiblePerformer } from '../lib/order-attribution-api';
import { usePOSStore } from '../store/pos-store';
import { useRootStore, type RootState } from '../store/root-store';
import { t } from '../i18n';

interface PerformerSelectProps {
  disabled?: boolean;
}

/**
 * Picks the employee an order is credited to when the operator is keying it on
 * their behalf. Hidden unless the POS Profile enables it and the user holds a
 * permitted role; the backend validates the choice regardless.
 */
export function PerformerSelect({ disabled }: PerformerSelectProps) {
  const { posProfile, selectedPerformer, setSelectedPerformer, isUpdatingOrder } = usePOSStore();
  const user = useRootStore((state: RootState) => state.user);
  const [performers, setPerformers] = useState<EligiblePerformer[]>([]);

  const enabled = canOrderOnBehalf(user, posProfile);
  const profileName = posProfile?.name;

  useEffect(() => {
    if (!enabled || !profileName) {
      setPerformers([]);
      return;
    }

    let cancelled = false;
    listEligiblePerformers(profileName)
      .then((rows) => {
        if (!cancelled) setPerformers(rows);
      })
      .catch(() => {
        if (!cancelled) setPerformers([]);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, profileName]);

  if (!enabled) return null;

  const required = Boolean(posProfile?.custom_require_performer_on_order);

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">
        {t('order.performed_by')}
        {required ? ' *' : ''}
      </label>
      <Select
        value={selectedPerformer ?? ''}
        onValueChange={(value: string) => setSelectedPerformer(value || null)}
        disabled={disabled || isUpdatingOrder}
        placeholder={t('order.select_performer')}
        aria-label={t('order.performed_by')}
      >
        {!required && <SelectItem value="">{t('order.no_performer')}</SelectItem>}
        {performers.map((performer) => (
          <SelectItem key={performer.name} value={performer.name}>
            {performer.employee_name}
            {performer.designation ? ` — ${performer.designation}` : ''}
          </SelectItem>
        ))}
      </Select>
    </div>
  );
}

export default PerformerSelect;
