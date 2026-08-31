import React, { useEffect, useState, useCallback } from 'react';
import { Trash2, Plus, Save } from 'lucide-react';
import {
  Button,
  Input,
  Select,
  SelectItem,
  Card,
  Checkbox,
  Page,
  Section,
  Spinner,
  showToast,
} from '@ury/ui';
import { call } from '@ury/core';
import { useBranchContext } from '../../context/BranchContext';
import { SearchableSelect, Option } from '../../components/common/SearchableSelect';

interface Tier {
  from_amount: number;
  rate: number;
}

interface Rule {
  branch?: string;
  designation?: string;
  employee?: string;
  rate_type: 'Flat' | 'Tiered';
  rate: number;
  tier_mode?: 'Marginal' | 'Slab';
  disabled: boolean;
  idx: number;
  tiers: Tier[];
}

interface CommissionSettings {
  enabled: boolean;
  commission_base: 'Net Sales' | 'Net Total' | 'Item Total' | 'Grand Total';
  include_returns: boolean;
  attribution_mode: 'Opener' | 'Closer' | 'Split Evenly' | 'Split By Contribution';
  default_rate: number;
  tier_period: 'Monthly' | 'Weekly';
  rules: Rule[];
}

interface EmployeeOption {
  name: string;
  employee_name: string;
}

/** Frappe/frappe-js-sdk error objects carry the real message inside
 * `_server_messages` (a JSON-encoded array of JSON-encoded {message} objects)
 * or `.exception`, not in `.message` (which is often just "417"/"400"). */
function getErrorMessage(err: any, fallback: string): string {
  try {
    const serverMessages = err?._server_messages ? JSON.parse(err._server_messages) : null;
    if (serverMessages?.length) {
      const first = JSON.parse(serverMessages[0]);
      if (first?.message) return first.message;
    }
  } catch {
    // fall through to other shapes below
  }
  if (typeof err?.exception === 'string') {
    const lastLine = err.exception.trim().split('\n').pop();
    if (lastLine) return lastLine.replace(/^\w+(\.\w+)*Error:\s*/, '');
  }
  return err?.message || fallback;
}

export const CommissionSettingsPage: React.FC = () => {
  const { branches } = useBranchContext();
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // Policy settings
  const [enabled, setEnabled] = useState<boolean>(false);
  const [commissionBase, setCommissionBase] = useState<string>('Net Sales');
  const [includeReturns, setIncludeReturns] = useState<boolean>(false);
  const [attributionMode, setAttributionMode] = useState<string>('Opener');
  const [defaultRate, setDefaultRate] = useState<number>(0);
  const [tierPeriod, setTierPeriod] = useState<string>('Monthly');

  // Rules
  const [rules, setRules] = useState<Rule[]>([]);

  // Designations and employees
  const [designations, setDesignations] = useState<Option[]>([]);
  const [loadingDesignations, setLoadingDesignations] = useState<boolean>(false);
  const [employeeSearchResults, setEmployeeSearchResults] = useState<Map<number, EmployeeOption[]>>(new Map());
  const [searchingEmployee, setSearchingEmployee] = useState<Set<number>>(new Set());

  // Branch options
  const branchOptions: Option[] = branches.map((b) => ({
    value: b.id,
    label: b.name,
  }));

  const loadAll = async () => {
    setLoading(true);
    try {
      const [settingsRes, designationsRes] = await Promise.all([
        call.get<CommissionSettings>('ury.ury.report_api.commission.get_commission_settings'),
        call.get<any>('frappe.client.get_list', {
          doctype: 'Designation',
          fields: ['name'],
          limit_page_length: 500,
        }).catch(() => ({ message: [] })),
      ]);

      const settings: CommissionSettings = settingsRes.message ?? settingsRes;

      setEnabled(settings.enabled);
      setCommissionBase(settings.commission_base || 'Net Sales');
      setIncludeReturns(settings.include_returns);
      setAttributionMode(settings.attribution_mode || 'Opener');
      setDefaultRate(settings.default_rate || 0);
      setTierPeriod(settings.tier_period || 'Monthly');
      setRules(settings.rules || []);

      const desRes = designationsRes.message ?? designationsRes;
      const designList = Array.isArray(desRes) ? desRes : [];
      setDesignations(designList.map((d: any) => ({
        value: d.name,
        label: d.name,
      })));
    } catch (err) {
      console.error('Failed to load commission settings:', err);
      showToast.error('Failed to load commission settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const searchEmployees = useCallback(async (query: string, ruleIdx: number) => {
    if (!query || query.length < 2) {
      setEmployeeSearchResults((prev) => {
        const next = new Map(prev);
        next.delete(ruleIdx);
        return next;
      });
      return;
    }

    setSearchingEmployee((prev) => new Set(prev).add(ruleIdx));
    try {
      const res = await call.post<EmployeeOption[]>(
        'ury.ury.report_api.commission.search_commission_employees',
        { query }
      );
      const employees = res.message ?? res;
      setEmployeeSearchResults((prev) => {
        const next = new Map(prev);
        next.set(ruleIdx, Array.isArray(employees) ? employees : []);
        return next;
      });
    } catch (err) {
      console.error('Failed to search employees:', err);
    } finally {
      setSearchingEmployee((prev) => {
        const next = new Set(prev);
        next.delete(ruleIdx);
        return next;
      });
    }
  }, []);

  const debouncedEmployeeSearch = useCallback(
    (() => {
      const timeouts = new Map<number, NodeJS.Timeout>();
      return (query: string, ruleIdx: number) => {
        if (timeouts.has(ruleIdx)) {
          clearTimeout(timeouts.get(ruleIdx)!);
        }
        const timeout = setTimeout(() => {
          searchEmployees(query, ruleIdx);
          timeouts.delete(ruleIdx);
        }, 300);
        timeouts.set(ruleIdx, timeout);
      };
    })(),
    [searchEmployees]
  );

  const updateRule = (idx: number, updates: Partial<Rule>) => {
    setRules((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, ...updates } : r))
    );
  };

  const addRule = () => {
    const nextIdx = Math.max(0, ...rules.map((r) => r.idx), 0) + 1;
    setRules((prev) => [
      ...prev,
      {
        branch: '',
        designation: '',
        employee: '',
        rate_type: 'Flat',
        rate: 0,
        tier_mode: 'Marginal',
        disabled: false,
        idx: nextIdx,
        tiers: [],
      },
    ]);
  };

  const removeRule = (idx: number) => {
    setRules((prev) => prev.filter((_, i) => i !== idx));
  };

  const addTier = (ruleIdx: number) => {
    setRules((prev) =>
      prev.map((r, i) => {
        if (i !== ruleIdx) return r;
        const nextFromAmount = r.tiers.length > 0
          ? Math.max(...r.tiers.map((t) => t.from_amount)) + 1000
          : 0;
        return {
          ...r,
          tiers: [...r.tiers, { from_amount: nextFromAmount, rate: 0 }],
        };
      })
    );
  };

  const removeTier = (ruleIdx: number, tierIdx: number) => {
    setRules((prev) =>
      prev.map((r, i) => {
        if (i !== ruleIdx) return r;
        return {
          ...r,
          tiers: r.tiers.filter((_, ti) => ti !== tierIdx),
        };
      })
    );
  };

  const updateTier = (ruleIdx: number, tierIdx: number, updates: Partial<Tier>) => {
    setRules((prev) =>
      prev.map((r, i) => {
        if (i !== ruleIdx) return r;
        return {
          ...r,
          tiers: r.tiers.map((t, ti) =>
            ti === tierIdx ? { ...t, ...updates } : t
          ),
        };
      })
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: CommissionSettings = {
        enabled,
        commission_base: commissionBase as 'Net Sales' | 'Net Total' | 'Item Total' | 'Grand Total',
        include_returns: includeReturns,
        attribution_mode: attributionMode as 'Opener' | 'Closer' | 'Split Evenly' | 'Split By Contribution',
        default_rate: defaultRate,
        tier_period: tierPeriod as 'Monthly' | 'Weekly',
        rules,
      };

      const res = await call.post<CommissionSettings>(
        'ury.ury.report_api.commission.update_commission_settings',
        payload
      );
      const updated = res.message ?? res;
      setRules(updated.rules || []);
      showToast.success('Commission settings saved');
    } catch (err: any) {
      showToast.error(getErrorMessage(err, 'Failed to save commission settings'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16 flex items-center justify-center bg-card rounded-lg border border-border">
        <Spinner className="w-8 h-8 text-primary" />
      </div>
    );
  }

  return (
    <Page>
      {/* Header */}
      <Section className="!mt-0">
        <Card padding="lg" className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl shadow-xs">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Commission Settings</h1>
            <p className="text-sm text-muted-foreground">
              Configure commission rules, attribution modes, and calculation bases.
            </p>
          </div>
        </Card>
      </Section>

      <Section>
        {/* Policy Card */}
        <Card padding="none" className="rounded-xl overflow-hidden shadow-xs">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-bold text-foreground">Commission Policy</h2>
            <p className="text-xs text-muted-foreground">Global settings for commission calculation.</p>
          </div>

          <div className="p-6 space-y-6">
            {/* Enable toggle */}
            <div className="flex items-center justify-between p-4 bg-card rounded-xl border border-border">
              <div>
                <span className="text-sm font-semibold text-foreground block">Enable Commission</span>
                <span className="text-xs text-muted-foreground">
                  Turn on to activate commission calculations for all employees.
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Commission Base */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Commission Base</label>
                <Select value={commissionBase} onValueChange={setCommissionBase}>
                  <SelectItem value="Net Sales">Net Sales</SelectItem>
                  <SelectItem value="Net Total">Net Total</SelectItem>
                  <SelectItem value="Item Total">Item Total</SelectItem>
                  <SelectItem value="Grand Total">Grand Total</SelectItem>
                </Select>
                <p className="text-xs text-muted-foreground mt-2">
                  Net Sales: pre-tax revenue, discount-adjusted (recommended). Net Total: pre-tax as recorded. Item Total: sum of item prices before document discount. Grand Total: includes tax (not recommended).
                </p>
              </div>

              {/* Attribution Mode */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Attribution Mode</label>
                <Select value={attributionMode} onValueChange={setAttributionMode}>
                  <SelectItem value="Opener">Opener</SelectItem>
                  <SelectItem value="Closer">Closer</SelectItem>
                  <SelectItem value="Split Evenly">Split Evenly</SelectItem>
                  <SelectItem value="Split By Contribution">Split By Contribution</SelectItem>
                </Select>
                <p className="text-xs text-muted-foreground mt-2">
                  Opener: whoever started the order (default). Closer: whoever closed/billed. Split Evenly: 50/50 when they differ. Split By Contribution: split by line items entered.
                </p>
              </div>

              {/* Include Returns */}
              <div className="flex items-center justify-between p-4 bg-card rounded-xl border border-border">
                <div>
                  <span className="text-sm font-semibold text-foreground block">Include Returns</span>
                  <span className="text-xs text-muted-foreground">Refunded sales reduce commission base (recommended).</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeReturns}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIncludeReturns(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              {/* Default Rate */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Default Rate (%)</label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={defaultRate}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setDefaultRate(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))
                  }
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Applied when no rule matches an employee.
                </p>
              </div>

              {/* Tier Period */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Tier Period</label>
                <Select value={tierPeriod} onValueChange={setTierPeriod}>
                  <SelectItem value="Monthly">Monthly</SelectItem>
                  <SelectItem value="Weekly">Weekly</SelectItem>
                </Select>
                <p className="text-xs text-muted-foreground mt-2">
                  Window over which tiered commission rates are evaluated.
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Rules Card */}
        <Card padding="none" className="rounded-xl overflow-hidden shadow-xs">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-foreground">Commission Rules</h2>
              <p className="text-xs text-muted-foreground">
                Set branch, designation, or employee-specific commission rates and tiers.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={addRule}
              className="inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Rule
            </Button>
          </div>

          <div className="p-6 space-y-4">
            {rules.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No rules yet. Add one to define commission rates for specific branches, designations, or employees.
              </p>
            ) : (
              rules.map((rule, ruleIdx) => (
                <div key={ruleIdx} className="p-4 bg-card rounded-lg border border-border space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        size="sm"
                        checked={rule.disabled}
                        onChange={(e) => updateRule(ruleIdx, { disabled: e.target.checked })}
                      />
                      <label className="text-xs text-muted-foreground">Disabled</label>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => removeRule(ruleIdx)}
                      className="text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Branch */}
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">Branch</label>
                      <SearchableSelect
                        id={`rule-${ruleIdx}-branch`}
                        value={rule.branch || ''}
                        options={branchOptions}
                        onChange={(_, val) => updateRule(ruleIdx, { branch: val })}
                        placeholder="Any branch"
                        strict
                      />
                    </div>

                    {/* Designation */}
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">Designation</label>
                      <SearchableSelect
                        id={`rule-${ruleIdx}-designation`}
                        value={rule.designation || ''}
                        options={designations}
                        onChange={(_, val) => updateRule(ruleIdx, { designation: val })}
                        placeholder="Any designation"
                        strict
                      />
                    </div>

                    {/* Employee */}
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">Employee</label>
                      <SearchableSelect
                        id={`rule-${ruleIdx}-employee`}
                        value={rule.employee || ''}
                        options={
                          employeeSearchResults.get(ruleIdx)?.map((e) => ({
                            value: e.name,
                            label: e.employee_name,
                          })) || []
                        }
                        onChange={(_, val) => updateRule(ruleIdx, { employee: val })}
                        onBlur={(id) => {
                          // Clear search results on blur
                          setEmployeeSearchResults((prev) => {
                            const next = new Map(prev);
                            next.delete(ruleIdx);
                            return next;
                          });
                        }}
                        placeholder="Search employee..."
                        strict
                      />
                    </div>
                  </div>

                  {/* Rate Type Toggle */}
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-foreground">Rate Type:</label>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rule.rate_type === 'Tiered'}
                          onChange={(e) =>
                            updateRule(ruleIdx, {
                              rate_type: e.target.checked ? 'Tiered' : 'Flat',
                            })
                          }
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                      </label>
                      <span className="text-xs text-muted-foreground">
                        {rule.rate_type === 'Flat' ? 'Flat' : 'Tiered'}
                      </span>
                    </div>
                  </div>

                  {/* Flat Rate */}
                  {rule.rate_type === 'Flat' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1">Rate (%)</label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={rule.rate}
                          onChange={(e) =>
                            updateRule(ruleIdx, {
                              rate: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)),
                            })
                          }
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  )}

                  {/* Tiered Rates */}
                  {rule.rate_type === 'Tiered' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-foreground">Tier Mode</label>
                        <Select
                          value={rule.tier_mode || 'Marginal'}
                          onValueChange={(val) =>
                            updateRule(ruleIdx, { tier_mode: val as 'Marginal' | 'Slab' })
                          }
                        >
                          <SelectItem value="Marginal">Marginal</SelectItem>
                          <SelectItem value="Slab">Slab</SelectItem>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        {rule.tiers.map((tier, tierIdx) => (
                          <div key={tierIdx} className="flex items-end gap-2">
                            <div className="flex-1">
                              <label className="block text-xs font-medium text-foreground mb-1">
                                From Amount
                              </label>
                              <Input
                                type="number"
                                min="0"
                                step="1"
                                value={tier.from_amount}
                                onChange={(e) =>
                                  updateTier(ruleIdx, tierIdx, {
                                    from_amount: Math.max(0, parseFloat(e.target.value) || 0),
                                  })
                                }
                                placeholder="0"
                              />
                            </div>
                            <div className="flex-1">
                              <label className="block text-xs font-medium text-foreground mb-1">
                                Rate (%)
                              </label>
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={tier.rate}
                                onChange={(e) =>
                                  updateTier(ruleIdx, tierIdx, {
                                    rate: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)),
                                  })
                                }
                                placeholder="0.00"
                              />
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => removeTier(ruleIdx, tierIdx)}
                              className="text-destructive hover:bg-destructive/10 mb-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addTier(ruleIdx)}
                        className="w-full"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Add Tier
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </Card>
      </Section>

      {/* Save Button */}
      <Section className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Spinner className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          Save Commission Settings
        </Button>
      </Section>
    </Page>
  );
};

export default CommissionSettingsPage;
