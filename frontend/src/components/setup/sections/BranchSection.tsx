import React from 'react';
import { useConfigure } from '../../../context/ConfigureContext';
import { Input } from '@ury/ui';
import { Switch } from '../../ui/switch';
import { t } from '../../../i18n';

export function BranchSection() {
  const { branch, updateBranch } = useConfigure();

  return (
    <div className="space-y-5 w-full">
      {/* Row 1: Branch Name + Tax ID */}
      <div className="grid grid-cols-1 w-full gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">{t('dash.branch_section.branch_name')}<span className="text-red-500">*</span>
          </label>
          <Input
            type="text"
            value={branch.branchName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              updateBranch({ branchName: e.target.value })
            }
            placeholder={t('dash.branch_section.main_branch')}
            className="w-full focus-visible:ring-primary"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">{t('dash.branch_section.tax_id')}</label>
          <Input
            type="text"
            value={branch.taxId}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              updateBranch({ taxId: e.target.value })
            }
            placeholder={t('dash.branch_section.optional')}
            className="w-full focus-visible:ring-primary"
          />
          <p className="text-xs text-muted-foreground">{t('dash.branch_section.optional_add_this_now_or_later')}</p>
        </div>
      </div>

      {/* Row 2: Invoice Prefix + Delivery apps Switch */}
      <div className="grid grid-cols-1 w-full gap-4 items-start">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">{t('dash.branch_section.invoice_prefix')}<span className="text-red-500">*</span>
          </label>
          <Input
            type="text"
            value={branch.invoicePrefix}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              updateBranch({ invoicePrefix: e.target.value })
            }
            placeholder={t('dash.branch_section.inv')}
            className="w-full focus-visible:ring-primary"
          />
          <p className="text-xs text-muted-foreground">{t('dash.branch_section.shown_at_the_start_of_every_bill_number_like')}</p>
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
            >{t('dash.branch_section.takes_orders_through_food_delivery_apps')}</label>
          </div>
        </div>
      </div>

      {/* Row 3: Aggregator Prefix (conditional, only when switch is ON) */}
      {branch.takesAggregatorOrders && (
        <div className="space-y-1.5 w-full">
          <label className="text-sm font-medium text-foreground">{t('dash.branch_section.aggregator_prefix')}</label>
          <Input
            type="text"
            value={branch.aggregatorPrefix}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              updateBranch({ aggregatorPrefix: e.target.value })
            }
            placeholder={t('dash.branch_section.agg')}
            className="w-full focus-visible:ring-primary"
          />
          <p className="text-xs text-muted-foreground">{t('dash.branch_section.a_separate_bill_number_series_for_delivery_a')}</p>
        </div>
      )}
    </div>
  );
}
