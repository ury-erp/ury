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
      <div className="space-y-3">
        {/* Header Row */}
        <div className="hidden md:flex gap-3 px-2 text-xs font-medium text-[#4B5563]">
          <div className="flex-1">Payment Method Name</div>
          {paymentMethods.length > 1 && <div className="w-8"></div>}
        </div>

        {paymentMethods.map((method) => (
          <div
            key={method.id}
            className="py-2 flex flex-col md:flex-row md:items-center gap-3"
          >
            <div className="flex-1">
              <Input
                type="text"
                value={method.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updatePaymentMethod(method.id, { name: e.target.value })}
                placeholder="e.g. Cash, Card, UPI"
                className="w-full text-sm bg-white"
              />
            </div>

            {paymentMethods.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => deletePaymentMethod(method.id)}
                className="text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0 p-2 h-auto self-end md:self-center"
                title="Delete Payment Method"
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
        className="w-full py-2.5 border-dashed border-[#2B5CE6] text-[#2B5CE6] hover:bg-[#EFF4FF] flex items-center justify-center gap-2 text-sm font-medium"
      >
        <Plus className="w-4 h-4" />
        Add Payment Method
      </Button>
    </div>
  );
}
