import React, { useState } from 'react';
import {
  Clock,
  Receipt,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Save,
  Check,
  Calculator,
  FileSpreadsheet
} from 'lucide-react';
import { Button, Input, Select, SelectItem, Card } from '@ury/ui';

interface FixedExpenseItem {
  id: string;
  name: string;
  amount: number;
  frequency: string;
}

interface PercentageExpenseItem {
  id: string;
  name: string;
  percentage: number;
  basis: string;
}

interface EmployeeCostItem {
  id: string;
  role: string;
  salary: number;
  count: number;
}

interface MonthlyExpenseItem {
  id: string;
  name: string;
  amount: number;
}

interface ConsumableItem {
  id: string;
  item_name: string;
  monthly_budget: number;
}

export const ReportSettingsPage: React.FC = () => {
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
  const [directFixedExpenses, setDirectFixedExpenses] = useState<FixedExpenseItem[]>([
    { id: '1', name: 'Kitchen Gas Cylinders', amount: 1500, frequency: 'Monthly' },
    { id: '2', name: 'Water & Utility Connection', amount: 450, frequency: 'Monthly' },
  ]);

  const [indirectFixedExpenses, setIndirectFixedExpenses] = useState<FixedExpenseItem[]>([
    { id: '1', name: 'Building Rent', amount: 4500, frequency: 'Monthly' },
    { id: '2', name: 'POS Software License', amount: 300, frequency: 'Monthly' },
  ]);

  const [percentageExpenses, setPercentageExpenses] = useState<PercentageExpenseItem[]>([
    { id: '1', name: 'Payment Gateway Commission', percentage: 2.1, basis: 'Gross Sales' },
    { id: '2', name: 'Aggregator Service Fee', percentage: 15.0, basis: 'Online Orders' },
  ]);

  const [employeeCosts, setEmployeeCosts] = useState<EmployeeCostItem[]>([
    { id: '1', role: 'Head Chef', salary: 4200, count: 1 },
    { id: '2', role: 'Line Cooks', salary: 2800, count: 3 },
    { id: '3', role: 'Floor Waiters', salary: 2200, count: 5 },
  ]);

  const [monthlyFixedExpenses, setMonthlyFixedExpenses] = useState<MonthlyExpenseItem[]>([
    { id: '1', name: 'Internet & Telephony', amount: 180 },
    { id: '2', name: 'Pest Control & Sanitation', amount: 250 },
  ]);

  const [consumables, setConsumables] = useState<ConsumableItem[]>([
    { id: '1', item_name: 'Paper Rolls & Receipts', monthly_budget: 350 },
    { id: '2', item_name: 'Packaging Boxes & Cutlery', monthly_budget: 800 },
  ]);

  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const handleSave = () => {
    setSaveStatus('Report settings saved successfully');
    setTimeout(() => setSaveStatus(null), 3000);
  };

  // Add / Remove Handlers for Repeatable Tables
  const addDirectFixed = () => {
    setDirectFixedExpenses([
      ...directFixedExpenses,
      { id: Date.now().toString(), name: 'New Direct Expense', amount: 0, frequency: 'Monthly' },
    ]);
  };

  const addIndirectFixed = () => {
    setIndirectFixedExpenses([
      ...indirectFixedExpenses,
      { id: Date.now().toString(), name: 'New Indirect Expense', amount: 0, frequency: 'Monthly' },
    ]);
  };

  const addPercentageExpense = () => {
    setPercentageExpenses([
      ...percentageExpenses,
      { id: Date.now().toString(), name: 'New Fee', percentage: 1.0, basis: 'Gross Sales' },
    ]);
  };

  const addEmployeeCost = () => {
    setEmployeeCosts([
      ...employeeCosts,
      { id: Date.now().toString(), role: 'New Role', salary: 2000, count: 1 },
    ]);
  };

  const addMonthlyExpense = () => {
    setMonthlyFixedExpenses([
      ...monthlyFixedExpenses,
      { id: Date.now().toString(), name: 'New Monthly Expense', amount: 0 },
    ]);
  };

  const addConsumable = () => {
    setConsumables([
      ...consumables,
      { id: Date.now().toString(), item_name: 'New Consumable Item', monthly_budget: 100 },
    ]);
  };

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#7C3AED]/10 text-[#7C3AED] flex items-center justify-center font-semibold shrink-0">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">URY Report Settings</h1>
              <p className="text-sm text-gray-500">Configure financial parameters, overhead cost basis, operational shifts, and expense tables.</p>
            </div>
          </div>
          <Button
            onClick={handleSave}
            className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save Report Settings
          </Button>
        </div>

        {saveStatus && (
          <div className="p-4 bg-green-50 border border-green-200 text-green-800 rounded-xl flex items-center gap-2">
            <Check className="w-5 h-5 text-green-600" />
            <span className="text-sm font-medium">{saveStatus}</span>
          </div>
        )}

        {/* Expandable Accordion Cards Container */}
        <div className="space-y-6">

          {/* Accordion 1: Business Hours */}
          <Card className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-xs">
            <button
              onClick={() => toggleSection('businessHours')}
              className="w-full px-6 py-4 bg-white flex items-center justify-between border-b border-gray-100 hover:bg-gray-50/80 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-purple-50 text-[#7C3AED] flex items-center justify-center">
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
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#7C3AED]"></div>
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
                    <Button size="sm" onClick={addDirectFixed} className="bg-[#7C3AED] text-white hover:bg-[#6D28D9]">
                      <Plus className="w-4 h-4 mr-1" /> Add Row
                    </Button>
                  </div>

                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm text-gray-600">
                      <thead className="bg-gray-50 text-gray-700 font-medium border-b border-gray-200">
                        <tr>
                          <th className="p-3.5">Expense Name</th>
                          <th className="p-3.5">Amount ($)</th>
                          <th className="p-3.5">Frequency</th>
                          <th className="p-3.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {directFixedExpenses.map((row) => (
                          <tr key={row.id} className="hover:bg-gray-50/50">
                            <td className="p-3.5">
                              <Input
                                value={row.name}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  setDirectFixedExpenses(
                                    directFixedExpenses.map((item) =>
                                      item.id === row.id ? { ...item, name: e.target.value } : item
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
                            <td className="p-3.5">
                              <Select
                                value={row.frequency}
                                onValueChange={(val: string) =>
                                  setDirectFixedExpenses(
                                    directFixedExpenses.map((item) =>
                                      item.id === row.id ? { ...item, frequency: val } : item
                                    )
                                  )
                                }
                              >
                                <SelectItem value="Monthly">Monthly</SelectItem>
                                <SelectItem value="Quarterly">Quarterly</SelectItem>
                                <SelectItem value="Annual">Annual</SelectItem>
                              </Select>
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
                    <Button size="sm" onClick={addIndirectFixed} className="bg-[#7C3AED] text-white hover:bg-[#6D28D9]">
                      <Plus className="w-4 h-4 mr-1" /> Add Row
                    </Button>
                  </div>

                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm text-gray-600">
                      <thead className="bg-gray-50 text-gray-700 font-medium border-b border-gray-200">
                        <tr>
                          <th className="p-3.5">Expense Name</th>
                          <th className="p-3.5">Amount ($)</th>
                          <th className="p-3.5">Frequency</th>
                          <th className="p-3.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {indirectFixedExpenses.map((row) => (
                          <tr key={row.id} className="hover:bg-gray-50/50">
                            <td className="p-3.5">
                              <Input
                                value={row.name}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  setIndirectFixedExpenses(
                                    indirectFixedExpenses.map((item) =>
                                      item.id === row.id ? { ...item, name: e.target.value } : item
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
                            <td className="p-3.5">
                              <Select
                                value={row.frequency}
                                onValueChange={(val: string) =>
                                  setIndirectFixedExpenses(
                                    indirectFixedExpenses.map((item) =>
                                      item.id === row.id ? { ...item, frequency: val } : item
                                    )
                                  )
                                }
                              >
                                <SelectItem value="Monthly">Monthly</SelectItem>
                                <SelectItem value="Quarterly">Quarterly</SelectItem>
                                <SelectItem value="Annual">Annual</SelectItem>
                              </Select>
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
                    <Button size="sm" onClick={addPercentageExpense} className="bg-[#7C3AED] text-white hover:bg-[#6D28D9]">
                      <Plus className="w-4 h-4 mr-1" /> Add Row
                    </Button>
                  </div>

                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm text-gray-600">
                      <thead className="bg-gray-50 text-gray-700 font-medium border-b border-gray-200">
                        <tr>
                          <th className="p-3.5">Expense Name</th>
                          <th className="p-3.5">Percentage (%)</th>
                          <th className="p-3.5">Basis</th>
                          <th className="p-3.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {percentageExpenses.map((row) => (
                          <tr key={row.id} className="hover:bg-gray-50/50">
                            <td className="p-3.5">
                              <Input
                                value={row.name}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  setPercentageExpenses(
                                    percentageExpenses.map((item) =>
                                      item.id === row.id ? { ...item, name: e.target.value } : item
                                    )
                                  )
                                }
                              />
                            </td>
                            <td className="p-3.5">
                              <Input
                                type="number"
                                step="0.1"
                                value={row.percentage}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  setPercentageExpenses(
                                    percentageExpenses.map((item) =>
                                      item.id === row.id ? { ...item, percentage: Number(e.target.value) } : item
                                    )
                                  )
                                }
                              />
                            </td>
                            <td className="p-3.5">
                              <Select
                                value={row.basis}
                                onValueChange={(val: string) =>
                                  setPercentageExpenses(
                                    percentageExpenses.map((item) =>
                                      item.id === row.id ? { ...item, basis: val } : item
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
                    <Button size="sm" onClick={addEmployeeCost} className="bg-[#7C3AED] text-white hover:bg-[#6D28D9]">
                      <Plus className="w-4 h-4 mr-1" /> Add Row
                    </Button>
                  </div>

                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm text-gray-600">
                      <thead className="bg-gray-50 text-gray-700 font-medium border-b border-gray-200">
                        <tr>
                          <th className="p-3.5">Role / Title</th>
                          <th className="p-3.5">Monthly Salary ($)</th>
                          <th className="p-3.5">Headcount</th>
                          <th className="p-3.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {employeeCosts.map((row) => (
                          <tr key={row.id} className="hover:bg-gray-50/50">
                            <td className="p-3.5">
                              <Input
                                value={row.role}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  setEmployeeCosts(
                                    employeeCosts.map((item) =>
                                      item.id === row.id ? { ...item, role: e.target.value } : item
                                    )
                                  )
                                }
                              />
                            </td>
                            <td className="p-3.5">
                              <Input
                                type="number"
                                value={row.salary}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  setEmployeeCosts(
                                    employeeCosts.map((item) =>
                                      item.id === row.id ? { ...item, salary: Number(e.target.value) } : item
                                    )
                                  )
                                }
                              />
                            </td>
                            <td className="p-3.5">
                              <Input
                                type="number"
                                value={row.count}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  setEmployeeCosts(
                                    employeeCosts.map((item) =>
                                      item.id === row.id ? { ...item, count: Number(e.target.value) } : item
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
                    <Button size="sm" onClick={addMonthlyExpense} className="bg-[#7C3AED] text-white hover:bg-[#6D28D9]">
                      <Plus className="w-4 h-4 mr-1" /> Add Row
                    </Button>
                  </div>

                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm text-gray-600">
                      <thead className="bg-gray-50 text-gray-700 font-medium border-b border-gray-200">
                        <tr>
                          <th className="p-3.5">Expense Name</th>
                          <th className="p-3.5">Monthly Amount ($)</th>
                          <th className="p-3.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {monthlyFixedExpenses.map((row) => (
                          <tr key={row.id} className="hover:bg-gray-50/50">
                            <td className="p-3.5">
                              <Input
                                value={row.name}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  setMonthlyFixedExpenses(
                                    monthlyFixedExpenses.map((item) =>
                                      item.id === row.id ? { ...item, name: e.target.value } : item
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
                    <Button size="sm" onClick={addConsumable} className="bg-[#7C3AED] text-white hover:bg-[#6D28D9]">
                      <Plus className="w-4 h-4 mr-1" /> Add Row
                    </Button>
                  </div>

                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm text-gray-600">
                      <thead className="bg-gray-50 text-gray-700 font-medium border-b border-gray-200">
                        <tr>
                          <th className="p-3.5">Item Name</th>
                          <th className="p-3.5">Monthly Budget ($)</th>
                          <th className="p-3.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {consumables.map((row) => (
                          <tr key={row.id} className="hover:bg-gray-50/50">
                            <td className="p-3.5">
                              <Input
                                value={row.item_name}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  setConsumables(
                                    consumables.map((item) =>
                                      item.id === row.id ? { ...item, item_name: e.target.value } : item
                                    )
                                  )
                                }
                              />
                            </td>
                            <td className="p-3.5">
                              <Input
                                type="number"
                                value={row.monthly_budget}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  setConsumables(
                                    consumables.map((item) =>
                                      item.id === row.id ? { ...item, monthly_budget: Number(e.target.value) } : item
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
