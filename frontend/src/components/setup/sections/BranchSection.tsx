import React from 'react';
import { useConfigure } from '../../../context/ConfigureContext';
import { Input } from '@ury/ui';
import { Switch } from '../../ui/switch';
import { __ } from '../../../i18n';

export function BranchSection() {
  const { branch, updateBranch } = useConfigure();

  return (
    <div className="space-y-5 w-full">
      {/* Row 1: Branch Name + Tax ID */}
      <div className="grid grid-cols-1 w-full gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            {__('Branch Name')} <span className="text-destructive">*</span>
          </label>
          <Input
            type="text"
            value={branch.branchName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              updateBranch({ branchName: e.target.value })
            }
            placeholder={__('Main Branch')}
            className="w-full focus-visible:ring-primary"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">{__('Tax ID')}</label>
          <Input
            type="text"
            value={branch.taxId}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              updateBranch({ taxId: e.target.value })
            }
            placeholder={__('Optional')}
            className="w-full focus-visible:ring-primary"
          />
          <p className="text-xs text-muted-foreground">
            {__('Optional, add this now or later.')}
          </p>
        </div>
      </div>

      {/* Row 2: Invoice Prefix + Delivery apps Switch */}
      <div className="grid grid-cols-1 w-full gap-4 items-start">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            {__('Invoice Prefix')} <span className="text-destructive">*</span>
          </label>
          <Input
            type="text"
            value={branch.invoicePrefix}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              updateBranch({ invoicePrefix: e.target.value })
            }
            placeholder={__('INV-')}
            className="w-full focus-visible:ring-primary"
          />
          <p className="text-xs text-muted-foreground">
            {__('Shown at the start of every bill number, like INV-0001.')}
          </p>
        </div>

        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-3">
            <Switch
              id="takes-aggregator"
              checked={branch.takesAggregatorOrders}
              onCheckedChange={(checked: boolean) =>
                updateBranch({ takesAggregatorOrders: checked })
              }
            />
            <label
              htmlFor="takes-aggregator"
              className="text-sm font-medium text-foreground cursor-pointer leading-snug"
            >
              {__('Takes orders through food-delivery apps')}
            </label>
          </div>
        </div>
      </div>

      {/* Row 3: Aggregator Prefix (conditional, only when switch is ON) */}
      {branch.takesAggregatorOrders && (
        <div className="space-y-1.5 w-full">
          <label className="text-sm font-medium text-foreground">
            {__('Aggregator Prefix')}
          </label>
          <Input
            type="text"
            value={branch.aggregatorPrefix}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              updateBranch({ aggregatorPrefix: e.target.value })
            }
            placeholder={__('AGG-')}
            className="w-full focus-visible:ring-primary"
          />
          <p className="text-xs text-muted-foreground">
            {__('A separate bill number series for delivery app orders.')}
          </p>
        </div>
      )}
    </div>
  );
}
