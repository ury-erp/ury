import React from 'react';
import { useConfigure } from '../../../context/ConfigureContext';
import { Input, Button } from '@ury/ui';
import { Plus, Trash2 } from 'lucide-react';

export function PaymentSection() {
  const { paymentMethods, addPaymentMethod, updatePaymentMethod, deletePaymentMethod } = useConfigure();

  const handleAdd = () => {
    addPaymentMethod({
      name: '',
    });
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        How your customers will pay. Cash is added by default — add Card, UPI, or others your restaurant accepts. You can add more anytime later.
      </p>
      <div className="space-y-3">
        {/* Header Row */}
        <div className="hidden md:flex gap-3 px-2 text-xs font-medium text-muted-foreground">
          <div className="flex-1">Payment Method Name</div>
          {paymentMethods.length > 1 && <div className="w-8"></div>}
        </div>

        {paymentMethods.map((method) => (
          <div
            key={method.id}
            className="py-2 flex flex-col md:flex-row md:items-center gap-3"
          >
            <div className="flex-1">
              <label htmlFor={`payment-method-${method.id}`} className="sr-only">
                Payment Method Name
              </label>
              <Input
                id={`payment-method-${method.id}`}
                type="text"
                value={method.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updatePaymentMethod(method.id, { name: e.target.value })}
                placeholder="e.g. Cash, Card, UPI"
                className="w-full text-sm bg-background"
              />
            </div>

            {paymentMethods.length > 1 && (
              <Button
                type="button"
                variant="danger"
                size="icon"
                onClick={() => deletePaymentMethod(method.id)}
                className="shrink-0 self-end md:self-center"
                title="Delete Payment Method"
                aria-label="Delete payment method"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        ))}
      </div>

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
