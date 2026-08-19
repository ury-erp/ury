import React from 'react';
import { useConfigure } from '../../../context/ConfigureContext';
import { Input } from '@ury/ui';
import { Percent } from 'lucide-react';

export function BranchSection() {
  const { branch, updateBranch, taxConfig, updateTaxConfig } = useConfigure();

  return (
    <div className="space-y-5 max-w-lg">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          Branch Name <span className="text-red-500">*</span>
        </label>
        <Input
          type="text"
          value={branch.branchName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateBranch({ branchName: e.target.value })}
          placeholder="e.g. Main Branch"
          className="w-full focus-visible:ring-primary"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            Invoice Prefix <span className="text-red-500">*</span>
          </label>
          <Input
            type="text"
            value={branch.invoicePrefix}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateBranch({ invoicePrefix: e.target.value })}
            placeholder="e.g. INV-"
            className="w-full focus-visible:ring-primary"
          />
          <p className="text-xs text-muted-foreground">
            Shown at the start of every bill number, like INV-0001.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={branch.takesAggregatorOrders}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                updateBranch({ takesAggregatorOrders: e.target.checked })
              }
              className="focus-visible:ring-primary"
            />
            This restaurant also takes orders through food-delivery apps
          </label>
          {branch.takesAggregatorOrders && (
            <div className="space-y-1.5 pt-2 pl-6">
              <label className="text-sm font-medium text-foreground block">
                Aggregator Prefix
              </label>
              <Input
                type="text"
                value={branch.aggregatorPrefix}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateBranch({ aggregatorPrefix: e.target.value })
                }
                placeholder="e.g. AGG-"
                className="w-full focus-visible:ring-primary"
              />
              <p className="text-xs text-muted-foreground">
                A separate bill number series for orders from delivery apps, since their payment usually arrives later
                and many businesses want to track it separately for tax purposes.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          Tax ID / GSTIN
        </label>
        <Input
          type="text"
          value={branch.taxId}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateBranch({ taxId: e.target.value })}
          placeholder="e.g. 22AAAAA0000A1Z5"
          className="w-full focus-visible:ring-primary"
        />
        <p className="text-xs text-muted-foreground">
          Optional — add this now or later. Leave blank if you don't have one yet.
        </p>
      </div>

      {branch.taxId && (
        <div className="pt-4 border-t border-border space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Percent className="w-4 h-4 text-primary" />
            Tax Settings
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Tax Calculation Type</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input
                    type="radio"
                    name="taxType"
                    value="Inclusive"
                    checked={taxConfig.taxType === 'Inclusive'}
                    onChange={() => updateTaxConfig({ taxType: 'Inclusive' })}
                    className="text-primary focus:ring-primary"
                  />
                  Inclusive
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input
                    type="radio"
                    name="taxType"
                    value="Exclusive"
                    checked={taxConfig.taxType === 'Exclusive'}
                    onChange={() => updateTaxConfig({ taxType: 'Exclusive' })}
                    className="text-primary focus:ring-primary"
                  />
                  Exclusive
                </label>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Tax Percentage (%)</label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={taxConfig.taxPercentage}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateTaxConfig({ taxPercentage: parseFloat(e.target.value) || 0 })}
                placeholder="e.g. 5"
                className="w-full text-sm bg-background"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
