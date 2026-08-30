import { useEffect, useState } from 'react';
import { useConfigure } from '../../../context/ConfigureContext';
import { call } from '@ury/core';
import { SearchableSelect, Option } from '../../common/SearchableSelect';
import { Button } from '@ury/ui';
import { Plus, Trash2 } from 'lucide-react';
import { nextId } from '../../../utils/id';

const DEFAULTS = ['Cash', 'Card', 'UPI'];

export function PaymentSection() {
  const { paymentMethods, addPaymentMethod, updatePaymentMethod, deletePaymentMethod } = useConfigure();
  const [allModes, setAllModes] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    call<any>('frappe.client.get_list', {
      doctype: 'Mode of Payment',
      fields: ['name'],
      limit: 100,
    })
      .then((res: any) => {
        const rows: { name: string }[] = res?.message ?? res ?? [];
        const names = rows.map((r: { name: string }) => r.name);
        const opts = names.map(n => ({ value: n, label: n }));
        setAllModes(opts);

        // Pre-select defaults that exist in the list and aren't already selected
        const currentNames = new Set(paymentMethods.map((m) => m.name));
        DEFAULTS.forEach((d) => {
          if (names.includes(d) && !currentNames.has(d)) {
            addPaymentMethod({ name: d });
          }
        });
      })
      .catch(() =>
        setFetchError('Could not load payment methods, check your connection.')
      )
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = () => {
    addPaymentMethod({ name: '' });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {paymentMethods.map((method) => (
          <div key={method.id} className="flex items-center gap-3">
            <div className="flex-1">
              <SearchableSelect
                id={`pm-${method.id}`}
                value={method.name}
                options={allModes}
                onChange={(_id, value) => updatePaymentMethod(method.id, { name: value })}
                placeholder="Select Mode of Payment"
                disabled={loading}
              />
            </div>
            {paymentMethods.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => deletePaymentMethod(method.id)}
                className="text-destructive hover:text-destructive hover:bg-destructive-tint shrink-0 p-2 h-auto"
                title="Delete Method"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        ))}
      </div>

      {fetchError && (
        <p className="text-xs font-medium text-destructive">{fetchError}</p>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={handleAdd}
        className="w-full py-2.5 border-dashed border-primary text-primary hover:bg-primary/10 flex items-center justify-center gap-2 text-sm font-medium"
      >
        <Plus className="w-4 h-4" />
        Add Payment Method
      </Button>
    </div>
  );
}
