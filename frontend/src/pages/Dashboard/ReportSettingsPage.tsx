import React, { useState, useEffect } from 'react';
import {
  Clock,
  Receipt,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Save,
  Calculator,
  FileSpreadsheet
} from 'lucide-react';
import { Button, Input, Select, SelectItem, Card, Spinner, showToast } from '@ury/ui';
import { call } from '@ury/core';
import { useBranchContext } from '../../context/BranchContext';

interface FixedExpenseItem {
  id: string;
  expense: string;
  amount: number;
}

interface PercentageExpenseItem {
  id: string;
  expense: string;
  percent: number;
  percentage_type: string;
}

interface EmployeeCostItem {
  id: string;
  expense: string;
  amount: number;
}

interface MonthlyExpenseItem {
  id: string;
  expense: string;
  amount: number;
}

interface ConsumableItem {
  id: string;
  material: string;
  cost_per_unit: number;
}

interface ReportSettingsData {
  name: string;
  branch: string;
  extended_hours?: boolean;
  hours?: number;
  buying_price_list?: string;
  depreciation?: number;
  electricity_charges?: number;
  direct_fixed_expenses?: any[];
  indirect_fixed_expenses?: any[];
  percentage_expenses?: any[];
  employee_costs?: any[];
  monthly_fixed_expenses?: any[];
  consumables?: any[];
}

export const ReportSettingsPage: React.FC = () => {
  const { activeBranchId, activeBranch } = useBranchContext();
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [reportSettingsData, setReportSettingsData] = useState<ReportSettingsData | null>(null);

  // Accordion state
  const [openSections, setOpenSections] = useState<{ [key: string]: boolean }>({
    businessHours: true,
    costConfig: true,
    expenses: true,
  });

  const toggleSection = (sectionKey: string) => {
    setOpenSections((prev) => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
  };

  // Section 1: Business Hours
  const [extendedHours, setExtendedHours] = useState<boolean>(false);
  const [hoursOffset, setHoursOffset] = useState<number>(4);

  // Section 2: Cost Configuration
  const [buyingPriceList, setBuyingPriceList] = useState<string>('Standard Buying');
  const [depreciation, setDepreciation] = useState<number>(5.0);
  const [electricityCharges, setElectricityCharges] = useState<number>(1200.0);

  // Section 3: Expenses Repeatable Tables State
  const [directFixedExpenses, setDirectFixedExpenses] = useState<FixedExpenseItem[]>([]);
  const [indirectFixedExpenses, setIndirectFixedExpenses] = useState<FixedExpenseItem[]>([]);
  const [percentageExpenses, setPercentageExpenses] = useState<PercentageExpenseItem[]>([]);
  const [employeeCosts, setEmployeeCosts] = useState<EmployeeCostItem[]>([]);
  const [monthlyFixedExpenses, setMonthlyFixedExpenses] = useState<MonthlyExpenseItem[]>([]);
  const [consumables, setConsumables] = useState<ConsumableItem[]>([]);

  const branchToFetch = activeBranchId === 'all' ? activeBranch?.name : activeBranchId;

  const fetchReportSettings = async () => {
    if (!branchToFetch) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch URY Report Settings for this branch
      const settingsList = await call<any>('frappe.client.get_list', {
        doctype: 'URY Report Settings',
        filters: [['branch', '=', branchToFetch]],
        fields: ['name'],
        limit: 1,
      });
      const list = (settingsList as any)?.message || settingsList || [];

      if (list && list.length > 0) {
        // Fetch the full doc
        const settingsRes = await call<any>('frappe.client.get', {
          doctype: 'URY Report Settings',
          name: list[0].name,
        });
        const settings = (settingsRes as any)?.message || settingsRes;
        setReportSettingsData(settings);

        // Populate form from fetched data
        setExtendedHours(settings.extended_hours || false);
        setHoursOffset(settings.hours || 4);
        setBuyingPriceList(settings.buying_price_list || 'Standard Buying');
        setDepreciation(settings.depreciation || 5.0);
        setElectricityCharges(settings.electricity_charges || 1200.0);

        // Map child tables to form state
        setDirectFixedExpenses(
          (settings.direct_fixed_expenses || []).map((item: any, idx: number) => ({
            id: item.name || `df-${idx}`,
            expense: item.expense || '',
            amount: item.amount || 0,
          }))
        );
        setIndirectFixedExpenses(
          (settings.indirect_fixed_expenses || []).map((item: any, idx: number) => ({
            id: item.name || `if-${idx}`,
            expense: item.expense || '',
            amount: item.amount || 0,
          }))
        );
        setPercentageExpenses(
          (settings.percentage_expenses || []).map((item: any, idx: number) => ({
            id: item.name || `pe-${idx}`,
            expense: item.expense || '',
            percent: item.percent || 0,
            percentage_type: item.percentage_type || 'Gross Sales',
          }))
        );
        setEmployeeCosts(
          (settings.employee_costs || []).map((item: any, idx: number) => ({
            id: item.name || `ec-${idx}`,
            expense: item.expense || '',
            amount: item.amount || 0,
          }))
        );
        setMonthlyFixedExpenses(
          (settings.monthly_fixed_expenses || []).map((item: any, idx: number) => ({
            id: item.name || `mf-${idx}`,
            expense: item.expense || '',
            amount: item.amount || 0,
          }))
        );
        setConsumables(
          (settings.consumables || []).map((item: any, idx: number) => ({
            id: item.name || `c-${idx}`,
            material: item.material || '',
            cost_per_unit: item.cost_per_unit || 0,
          }))
        );
      } else {
        // No existing doc, start with defaults
        setReportSettingsData(null);
        setExtendedHours(false);
        setHoursOffset(4);
        setBuyingPriceList('Standard Buying');
        setDepreciation(5.0);
        setElectricityCharges(1200.0);
        setDirectFixedExpenses([]);
        setIndirectFixedExpenses([]);
        setPercentageExpenses([]);
        setEmployeeCosts([]);
        setMonthlyFixedExpenses([]);
        setConsumables([]);
      }
    } catch (err) {
      console.error('Failed to fetch report settings:', err);
      showToast.error('Failed to load report settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeBranchId && activeBranchId !== 'all' && activeBranch?.name) {
      fetchReportSettings();
    } else if (activeBranchId === 'all') {
      fetchReportSettings();
    }
  }, [activeBranchId, activeBranch]);

  // Add / Remove Handlers for Repeatable Tables
  const addDirectFixed = () => {
    setDirectFixedExpenses([
      ...directFixedExpenses,
      { id: Date.now().toString(), expense: 'New Direct Expense', amount: 0 },
    ]);
  };

  const addIndirectFixed = () => {
    setIndirectFixedExpenses([
      ...indirectFixedExpenses,
      { id: Date.now().toString(), expense: 'New Indirect Expense', amount: 0 },
    ]);
  };

  const addPercentageExpense = () => {
    setPercentageExpenses([
      ...percentageExpenses,
      { id: Date.now().toString(), expense: 'New Fee', percent: 1.0, percentage_type: 'Gross Sales' },
    ]);
  };

  const addEmployeeCost = () => {
    setEmployeeCosts([
      ...employeeCosts,
      { id: Date.now().toString(), expense: 'New Employee Cost', amount: 0 },
    ]);
  };

  const addMonthlyExpense = () => {
    setMonthlyFixedExpenses([
      ...monthlyFixedExpenses,
      { id: Date.now().toString(), expense: 'New Monthly Expense', amount: 0 },
    ]);
  };

  const addConsumable = () => {
    setConsumables([
      ...consumables,
      { id: Date.now().toString(), material: 'New Consumable Item', cost_per_unit: 0 },
    ]);
  };

  const handleSave = async () => {
    if (!branchToFetch) {
      showToast.error('No branch selected');
      return;
    }

    setSaving(true);
    try {
      const docToSave: any = {
        doctype: 'URY Report Settings',
        branch: branchToFetch,
        extended_hours: extendedHours,
        hours: hoursOffset,
        buying_price_list: buyingPriceList,
        depreciation: depreciation,
        electricity_charges: electricityCharges,
        direct_fixed_expenses: directFixedExpenses.map((item) => ({
          expense: item.expense,
          amount: item.amount,
        })),
        indirect_fixed_expenses: indirectFixedExpenses.map((item) => ({
          expense: item.expense,
          amount: item.amount,
        })),
        percentage_expenses: percentageExpenses.map((item) => ({
          expense: item.expense,
          percent: item.percent,
          percentage_type: item.percentage_type,
        })),
        employee_costs: employeeCosts.map((item) => ({
          expense: item.expense,
          amount: item.amount,
        })),
        monthly_fixed_expenses: monthlyFixedExpenses.map((item) => ({
          expense: item.expense,
          amount: item.amount,
        })),
        consumables: consumables.map((item) => ({
          material: item.material,
          cost_per_unit: item.cost_per_unit,
        })),
      };

      if (reportSettingsData) {
        // Update existing doc
        docToSave.name = reportSettingsData.name;
        await call('frappe.client.save', { doc: docToSave });
      } else {
        // Insert new doc
        await call('frappe.client.insert', { doc: docToSave });
      }

      showToast.success('Report settings saved successfully');
      fetchReportSettings();
    } catch (err: any) {
      showToast.error(err.message || 'Failed to save report settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16 flex items-center justify-center bg-white rounded-lg border border-gray-200">
        <Spinner className="w-8 h-8 text-primary" />
      </div>
    );
  }

  const branchLabel = activeBranchId === 'all' ? 'All Branches' : (activeBranch?.name || 'Selected Branch');

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-semibold shrink-0">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">URY Report Settings</h1>
              <p className="text-sm text-gray-500">Configure financial parameters, overhead cost basis, and operational shifts for <span className="font-semibold text-primary">{branchLabel}</span></p>
            </div>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary hover:bg-primary/90 text-white flex items-center gap-2"
          >
            {saving ? <Spinner className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            Save Report Settings
          </Button>
        </div>

        {/* Expandable Accordion Cards Container */}
        <div className="space-y-6">

          {/* Accordion 1: Business Hours */}
          <Card className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-xs">
            <button
              onClick={() => toggleSection('businessHours')}
              className="w-full px-6 py-4 bg-white flex items-center justify-between border-b border-gray-100 hover:bg-gray-50/80 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-purple-50 text-primary flex items-center justify-center">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">1. Business Hours & Shift Cutoffs</h2>
                  <p className="text-xs text-gray-500">Extended operating hours and reporting cut-off time offsets.</p>
                </div>
              </div>
              {openSections.businessHours ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </button>

            {openSections.businessHours && (
              <div className="p-6 space-y-6 bg-white">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <div>
                      <span className="text-sm font-semibold text-gray-900 block">Extended Hours</span>
                      <span className="text-xs text-gray-500">Enable shift calculation beyond midnight (00:00).</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={extendedHours}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExtendedHours(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Hours Offset (hours)
                    </label>
                    <Input
                      type="number"
                      value={hoursOffset}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHoursOffset(Number(e.target.value))}
                      placeholder="e.g. 4 for 4:00 AM cutoff"
                    />
                    <span className="text-xs text-gray-500 mt-1 block">
                      Sales before this offset hour will be attributed to the previous business date.
                    </span>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Accordion 2: Cost Configuration */}
          <Card className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-xs">
            <button
              onClick={() => toggleSection('costConfig')}
              className="w-full px-6 py-4 bg-white flex items-center justify-between border-b border-gray-100 hover:bg-gray-50/80 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Calculator className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">2. Cost Configuration</h2>
                  <p className="text-xs text-gray-500">Buying price lists, asset depreciation rates, and utility overhead allocations.</p>
                </div>
              </div>
              {openSections.costConfig ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </button>

            {openSections.costConfig && (
              <div className="p-6 space-y-6 bg-white">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Buying Price List
                    </label>
                    <Select value={buyingPriceList} onValueChange={(val: string) => setBuyingPriceList(val)}>
                      <SelectItem value="Standard Buying">Standard Buying</SelectItem>
                      <SelectItem value="Wholesale Price List">Wholesale Price List</SelectItem>
                      <SelectItem value="Vendor Cost Basis">Vendor Cost Basis</SelectItem>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Depreciation Rate (%)
                    </label>
                    <Input
                      type="number"
                      step="0.1"
                      value={depreciation}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDepreciation(Number(e.target.value))}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Electricity Charges ($ / month)
                    </label>
                    <Input
                      type="number"
                      value={electricityCharges}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setElectricityCharges(Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Accordion 3: Expenses Repeatable Tables */}
          <Card className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-xs">
            <button
              onClick={() => toggleSection('expenses')}
              className="w-full px-6 py-4 bg-white flex items-center justify-between border-b border-gray-100 hover:bg-gray-50/80 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">3. Expenses Tables</h2>
                  <p className="text-xs text-gray-500">Manage direct, indirect, percentage, headcount, and consumable recurring cost tables.</p>
                </div>
              </div>
              {openSections.expenses ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </button>

            {openSections.expenses && (
              <div className="p-6 space-y-8 bg-white">

                {/* 3.1 Direct Fixed Expenses */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">Direct Fixed Expenses</h3>
                      <p className="text-xs text-gray-500">Kitchen gas, raw material logistics, and direct production costs.</p>
                    </div>
                    <Button size="sm" onClick={addDirectFixed} className="bg-primary text-white hover:bg-primary/90">
                      <Plus className="w-4 h-4 mr-1" /> Add Row
                    </Button>
                  </div>

                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm text-gray-600">
                      <thead className="bg-gray-50 text-gray-700 font-medium border-b border-gray-200">
                        <tr>
                          <th className="p-3.5">Expense</th>
                          <th className="p-3.5">Amount ($)</th>
                          <th className="p-3.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {directFixedExpenses.map((row) => (
                          <tr key={row.id} className="hover:bg-gray-50/50">
                            <td className="p-3.5">
                              <Input
                                value={row.expense}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  setDirectFixedExpenses(
                                    directFixedExpenses.map((item) =>
                                      item.id === row.id ? { ...item, expense: e.target.value } : item
                                    )
                                  )
                                }
                              />
                            </td>
                            <td className="p-3.5">
                              <Input
                                type="number"
                                value={row.amount}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  setDirectFixedExpenses(
                                    directFixedExpenses.map((item) =>
                                      item.id === row.id ? { ...item, amount: Number(e.target.value) } : item
                                    )
                                  )
                                }
                              />
                            </td>
                            <td className="p-3.5 text-right">
                              <button
                                onClick={() =>
                                  setDirectFixedExpenses(directFixedExpenses.filter((item) => item.id !== row.id))
                                }
                                className="text-red-500 hover:text-red-700 p-1 rounded-md hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 3.2 Indirect Fixed Expenses */}
                <div className="space-y-3 pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">Indirect Fixed Expenses</h3>
                      <p className="text-xs text-gray-500">Building leases, software subscriptions, insurance, and administrative fees.</p>
                    </div>
                    <Button size="sm" onClick={addIndirectFixed} className="bg-primary text-white hover:bg-primary/90">
                      <Plus className="w-4 h-4 mr-1" /> Add Row
                    </Button>
                  </div>

                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm text-gray-600">
                      <thead className="bg-gray-50 text-gray-700 font-medium border-b border-gray-200">
                        <tr>
                          <th className="p-3.5">Expense</th>
                          <th className="p-3.5">Amount ($)</th>
                          <th className="p-3.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {indirectFixedExpenses.map((row) => (
                          <tr key={row.id} className="hover:bg-gray-50/50">
                            <td className="p-3.5">
                              <Input
                                value={row.expense}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  setIndirectFixedExpenses(
                                    indirectFixedExpenses.map((item) =>
                                      item.id === row.id ? { ...item, expense: e.target.value } : item
                                    )
                                  )
                                }
                              />
                            </td>
                            <td className="p-3.5">
                              <Input
                                type="number"
                                value={row.amount}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  setIndirectFixedExpenses(
                                    indirectFixedExpenses.map((item) =>
                                      item.id === row.id ? { ...item, amount: Number(e.target.value) } : item
                                    )
                                  )
                                }
                              />
                            </td>
                            <td className="p-3.5 text-right">
                              <button
                                onClick={() =>
                                  setIndirectFixedExpenses(indirectFixedExpenses.filter((item) => item.id !== row.id))
                                }
                                className="text-red-500 hover:text-red-700 p-1 rounded-md hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 3.3 Percentage Expenses */}
                <div className="space-y-3 pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">Percentage Expenses</h3>
                      <p className="text-xs text-gray-500">Payment processor rates, delivery aggregator cuts, and royalties.</p>
                    </div>
                    <Button size="sm" onClick={addPercentageExpense} className="bg-primary text-white hover:bg-primary/90">
                      <Plus className="w-4 h-4 mr-1" /> Add Row
                    </Button>
                  </div>

                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm text-gray-600">
                      <thead className="bg-gray-50 text-gray-700 font-medium border-b border-gray-200">
                        <tr>
                          <th className="p-3.5">Expense</th>
                          <th className="p-3.5">Percentage (%)</th>
                          <th className="p-3.5">Percentage Type</th>
                          <th className="p-3.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {percentageExpenses.map((row) => (
                          <tr key={row.id} className="hover:bg-gray-50/50">
                            <td className="p-3.5">
                              <Input
                                value={row.expense}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  setPercentageExpenses(
                                    percentageExpenses.map((item) =>
                                      item.id === row.id ? { ...item, expense: e.target.value } : item
                                    )
                                  )
                                }
                              />
                            </td>
                            <td className="p-3.5">
                              <Input
                                type="number"
                                step="0.1"
                                value={row.percent}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  setPercentageExpenses(
                                    percentageExpenses.map((item) =>
                                      item.id === row.id ? { ...item, percent: Number(e.target.value) } : item
                                    )
                                  )
                                }
                              />
                            </td>
                            <td className="p-3.5">
                              <Select
                                value={row.percentage_type}
                                onValueChange={(val: string) =>
                                  setPercentageExpenses(
                                    percentageExpenses.map((item) =>
                                      item.id === row.id ? { ...item, percentage_type: val } : item
                                    )
                                  )
                                }
                              >
                                <SelectItem value="Gross Sales">Gross Sales</SelectItem>
                                <SelectItem value="Net Sales">Net Sales</SelectItem>
                                <SelectItem value="Online Orders">Online Orders</SelectItem>
                              </Select>
                            </td>
                            <td className="p-3.5 text-right">
                              <button
                                onClick={() =>
                                  setPercentageExpenses(percentageExpenses.filter((item) => item.id !== row.id))
                                }
                                className="text-red-500 hover:text-red-700 p-1 rounded-md hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 3.4 Employee Costs */}
                <div className="space-y-3 pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">Employee Costs</h3>
                      <p className="text-xs text-gray-500">Staff role monthly compensation and headcount count.</p>
                    </div>
                    <Button size="sm" onClick={addEmployeeCost} className="bg-primary text-white hover:bg-primary/90">
                      <Plus className="w-4 h-4 mr-1" /> Add Row
                    </Button>
                  </div>

                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm text-gray-600">
                      <thead className="bg-gray-50 text-gray-700 font-medium border-b border-gray-200">
                        <tr>
                          <th className="p-3.5">Expense</th>
                          <th className="p-3.5">Amount ($)</th>
                          <th className="p-3.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {employeeCosts.map((row) => (
                          <tr key={row.id} className="hover:bg-gray-50/50">
                            <td className="p-3.5">
                              <Input
                                value={row.expense}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  setEmployeeCosts(
                                    employeeCosts.map((item) =>
                                      item.id === row.id ? { ...item, expense: e.target.value } : item
                                    )
                                  )
                                }
                              />
                            </td>
                            <td className="p-3.5">
                              <Input
                                type="number"
                                value={row.amount}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  setEmployeeCosts(
                                    employeeCosts.map((item) =>
                                      item.id === row.id ? { ...item, amount: Number(e.target.value) } : item
                                    )
                                  )
                                }
                              />
                            </td>
                            <td className="p-3.5 text-right">
                              <button
                                onClick={() =>
                                  setEmployeeCosts(employeeCosts.filter((item) => item.id !== row.id))
                                }
                                className="text-red-500 hover:text-red-700 p-1 rounded-md hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 3.5 Monthly Fixed Expenses */}
                <div className="space-y-3 pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">Monthly Fixed Expenses</h3>
                      <p className="text-xs text-gray-500">Recurring monthly telecom, maintenance, and sanitation overheads.</p>
                    </div>
                    <Button size="sm" onClick={addMonthlyExpense} className="bg-primary text-white hover:bg-primary/90">
                      <Plus className="w-4 h-4 mr-1" /> Add Row
                    </Button>
                  </div>

                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm text-gray-600">
                      <thead className="bg-gray-50 text-gray-700 font-medium border-b border-gray-200">
                        <tr>
                          <th className="p-3.5">Expense</th>
                          <th className="p-3.5">Amount ($)</th>
                          <th className="p-3.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {monthlyFixedExpenses.map((row) => (
                          <tr key={row.id} className="hover:bg-gray-50/50">
                            <td className="p-3.5">
                              <Input
                                value={row.expense}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  setMonthlyFixedExpenses(
                                    monthlyFixedExpenses.map((item) =>
                                      item.id === row.id ? { ...item, expense: e.target.value } : item
                                    )
                                  )
                                }
                              />
                            </td>
                            <td className="p-3.5">
                              <Input
                                type="number"
                                value={row.amount}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  setMonthlyFixedExpenses(
                                    monthlyFixedExpenses.map((item) =>
                                      item.id === row.id ? { ...item, amount: Number(e.target.value) } : item
                                    )
                                  )
                                }
                              />
                            </td>
                            <td className="p-3.5 text-right">
                              <button
                                onClick={() =>
                                  setMonthlyFixedExpenses(monthlyFixedExpenses.filter((item) => item.id !== row.id))
                                }
                                className="text-red-500 hover:text-red-700 p-1 rounded-md hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 3.6 Consumables */}
                <div className="space-y-3 pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">Consumables Budget</h3>
                      <p className="text-xs text-gray-500">Thermal paper rolls, take-away packaging, and disposable supplies.</p>
                    </div>
                    <Button size="sm" onClick={addConsumable} className="bg-primary text-white hover:bg-primary/90">
                      <Plus className="w-4 h-4 mr-1" /> Add Row
                    </Button>
                  </div>

                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm text-gray-600">
                      <thead className="bg-gray-50 text-gray-700 font-medium border-b border-gray-200">
                        <tr>
                          <th className="p-3.5">Material</th>
                          <th className="p-3.5">Cost Per Unit ($)</th>
                          <th className="p-3.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {consumables.map((row) => (
                          <tr key={row.id} className="hover:bg-gray-50/50">
                            <td className="p-3.5">
                              <Input
                                value={row.material}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  setConsumables(
                                    consumables.map((item) =>
                                      item.id === row.id ? { ...item, material: e.target.value } : item
                                    )
                                  )
                                }
                              />
                            </td>
                            <td className="p-3.5">
                              <Input
                                type="number"
                                value={row.cost_per_unit}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  setConsumables(
                                    consumables.map((item) =>
                                      item.id === row.id ? { ...item, cost_per_unit: Number(e.target.value) } : item
                                    )
                                  )
                                }
                              />
                            </td>
                            <td className="p-3.5 text-right">
                              <button
                                onClick={() =>
                                  setConsumables(consumables.filter((item) => item.id !== row.id))
                                }
                                className="text-red-500 hover:text-red-700 p-1 rounded-md hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}
          </Card>

        </div>
      </div>
    </div>
  );
};

export default ReportSettingsPage;
