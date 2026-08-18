import React from 'react';
import { useConfigure } from '../../../context/ConfigureContext';
import { Input } from '@ury/ui';
import { Percent } from 'lucide-react';

export function BranchSection() {
  const { branch, updateBranch, taxConfig, updateTaxConfig } = useConfigure();

  return (
    <div className="space-y-5 max-w-lg">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-[#374151]">
          Branch Name <span className="text-red-500">*</span>
        </label>
        <Input
          type="text"
          value={branch.branchName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateBranch({ branchName: e.target.value })}
          placeholder="e.g. Main Branch"
          className="w-full focus-visible:ring-[#2B5CE6]"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-[#374151]">
            Invoice Prefix <span className="text-red-500">*</span>
          </label>
          <Input
            type="text"
            value={branch.invoicePrefix}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateBranch({ invoicePrefix: e.target.value })}
            placeholder="e.g. INV-"
            className="w-full focus-visible:ring-[#2B5CE6]"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-[#374151]">
            Aggregator Prefix <span className="text-red-500">*</span>
          </label>
          <Input
            type="text"
            value={branch.aggregatorPrefix}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateBranch({ aggregatorPrefix: e.target.value })}
            placeholder="e.g. AGG-"
            className="w-full focus-visible:ring-[#2B5CE6]"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-[#374151]">
          Tax ID / GSTIN (Optional)
        </label>
        <Input
          type="text"
          value={branch.taxId}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateBranch({ taxId: e.target.value })}
          placeholder="e.g. 22AAAAA0000A1Z5"
          className="w-full focus-visible:ring-[#2B5CE6]"
        />
      </div>

      {branch.taxId && (
        <div className="pt-4 border-t border-[#E5E7EB] space-y-3">
          <h3 className="text-sm font-semibold text-[#111827] flex items-center gap-2">
            <Percent className="w-4 h-4 text-[#2B5CE6]" />
            Tax Settings
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-[#4B5563] block mb-1.5">Tax Calculation Type</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-[#374151] cursor-pointer">
                  <input
                    type="radio"
                    name="taxType"
                    value="Inclusive"
                    checked={taxConfig.taxType === 'Inclusive'}
                    onChange={() => updateTaxConfig({ taxType: 'Inclusive' })}
                    className="text-[#2B5CE6] focus:ring-[#2B5CE6]"
                  />
                  Inclusive
                </label>
                <label className="flex items-center gap-2 text-sm text-[#374151] cursor-pointer">
                  <input
                    type="radio"
                    name="taxType"
                    value="Exclusive"
                    checked={taxConfig.taxType === 'Exclusive'}
                    onChange={() => updateTaxConfig({ taxType: 'Exclusive' })}
                    className="text-[#2B5CE6] focus:ring-[#2B5CE6]"
                  />
                  Exclusive
                </label>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-[#4B5563] block mb-1">Tax Percentage (%)</label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={taxConfig.taxPercentage}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateTaxConfig({ taxPercentage: parseFloat(e.target.value) || 0 })}
                placeholder="e.g. 5"
                className="w-full text-sm bg-white"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
