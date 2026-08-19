import React, { useState } from 'react';
import {
  SlidersHorizontal,
  Settings,
  Printer,
  Users,
  UtensilsCrossed,
  Sliders,
  Save,
  Plus,
  Trash2,
  Check,
  Building2
} from 'lucide-react';
import { Button, Input, Select, SelectItem, Card } from '@ury/ui';
import posProfileSchema from '../../data/schemas/pos_profile.json';

interface PrinterConfig {
  id: string;
  printer: string;
  bill_printing: boolean;
  kot_printing: boolean;
}

interface AuthorizedCashier {
  id: string;
  user: string;
  main_cashier: boolean;
}

type TabKey = 'general' | 'operations' | 'printing' | 'cashiers' | 'kot' | 'advanced';

export const POSProfilePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('general');

  // Form State initialized with defaults from schema
  const [profileName, setProfileName] = useState<string>(
    posProfileSchema.properties.name.default || 'Main POS Profile'
  );
  const [branch, setBranch] = useState<string>(
    posProfileSchema.properties.branch.default || 'Main Branch'
  );
  const [restaurant, setRestaurant] = useState<string>(
    posProfileSchema.properties.restaurant.default || 'URY Fine Dining'
  );

  // Operations
  const [tableAttentionTime, setTableAttentionTime] = useState<number>(
    posProfileSchema.properties.operations.properties.table_attention_time.default || 15
  );
  const [paidInvoiceLimit, setPaidInvoiceLimit] = useState<number>(
    posProfileSchema.properties.operations.properties.paid_invoice_limit.default || 50000
  );
  const [enableDiscounts, setEnableDiscounts] = useState<boolean>(
    posProfileSchema.properties.operations.properties.enable_discounts.default
  );
  const [showItemImages, setShowItemImages] = useState<boolean>(
    posProfileSchema.properties.operations.properties.show_item_images.default
  );
  const [editOrderType, setEditOrderType] = useState<boolean>(
    posProfileSchema.properties.operations.properties.edit_order_type.default
  );
  const [removePrintedItems, setRemovePrintedItems] = useState<boolean>(
    posProfileSchema.properties.operations.properties.remove_printed_items.default
  );
  const [viewAllStatus, setViewAllStatus] = useState<boolean>(
    posProfileSchema.properties.operations.properties.view_all_status.default
  );
  const [dailyPosCloseRequired, setDailyPosCloseRequired] = useState<boolean>(
    posProfileSchema.properties.operations.properties.daily_pos_close_required.default
  );

  // Printing
  const [enableQzPrinting, setEnableQzPrinting] = useState<boolean>(
    posProfileSchema.properties.printing.properties.enable_qz_printing.default
  );
  const [qzHost, setQzHost] = useState<string>(
    posProfileSchema.properties.printing.properties.qz_host.default
  );
  const [printers, setPrinters] = useState<PrinterConfig[]>([
    { id: '1', printer: 'Counter Thermal Receipt Printer', bill_printing: true, kot_printing: false },
    { id: '2', printer: 'Kitchen Order Line Printer', bill_printing: false, kot_printing: true },
  ]);

  // Cashiers
  const [enableMultipleCashiers, setEnableMultipleCashiers] = useState<boolean>(
    posProfileSchema.properties.cashiers.properties.enable_multiple_cashiers.default
  );
  const [authorizedCashiers, setAuthorizedCashiers] = useState<AuthorizedCashier[]>([
    { id: '1', user: 'Alex Cashier (alex@ury.com)', main_cashier: true },
    { id: '2', user: 'Sarah Supervisor (sarah@ury.com)', main_cashier: false },
  ]);

  // Kitchen Order Tickets (KOT)
  const [namingSeries, setNamingSeries] = useState<string>(
    posProfileSchema.properties.kot.properties.naming_series.default
  );
  const [warningTime, setWarningTime] = useState<number>(
    posProfileSchema.properties.kot.properties.warning_time.default
  );
  const [enableReprint, setEnableReprint] = useState<boolean>(
    posProfileSchema.properties.kot.properties.enable_reprint.default
  );
  const [alertSound, setAlertSound] = useState<boolean>(
    posProfileSchema.properties.kot.properties.alert_sound.default
  );
  const [delayNotifications, setDelayNotifications] = useState<boolean>(
    posProfileSchema.properties.kot.properties.delay_notifications.default
  );
  const [resetOrderNumberDaily, setResetOrderNumberDaily] = useState<boolean>(
    posProfileSchema.properties.kot.properties.reset_order_number_daily.default
  );
  const [parcelPrinter, setParcelPrinter] = useState<string>(
    posProfileSchema.properties.kot.properties.parcel_printer.default
  );
  const [tablePrinter, setTablePrinter] = useState<string>(
    posProfileSchema.properties.kot.properties.table_printer.default
  );
  const [reprintFormat, setReprintFormat] = useState<string>(
    posProfileSchema.properties.kot.properties.reprint_format.default
  );

  // Advanced
  const [allowCustomRates, setAllowCustomRates] = useState<boolean>(
    posProfileSchema.properties.advanced.properties.allow_custom_rates.default
  );
  const [autoSelectTable, setAutoSelectTable] = useState<boolean>(
    posProfileSchema.properties.advanced.properties.auto_select_table.default
  );
  const [allowNegativeStock, setAllowNegativeStock] = useState<boolean>(
    posProfileSchema.properties.advanced.properties.allow_negative_stock.default
  );
  const [defaultCustomer, setDefaultCustomer] = useState<string>(
    posProfileSchema.properties.advanced.properties.default_customer.default
  );
  const [taxCategory, setTaxCategory] = useState<string>(
    posProfileSchema.properties.advanced.properties.tax_category.default
  );

  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const handleSave = () => {
    setSaveStatus('Profile updated successfully');
    setTimeout(() => setSaveStatus(null), 3000);
  };

  const addPrinter = () => {
    const newPrinter: PrinterConfig = {
      id: Date.now().toString(),
      printer: 'New Printer',
      bill_printing: true,
      kot_printing: false,
    };
    setPrinters([...printers, newPrinter]);
  };

  const removePrinter = (id: string) => {
    setPrinters(printers.filter((p) => p.id !== id));
  };

  const togglePrinterBill = (id: string) => {
    setPrinters(
      printers.map((p) => (p.id === id ? { ...p, bill_printing: !p.bill_printing } : p))
    );
  };

  const togglePrinterKOT = (id: string) => {
    setPrinters(
      printers.map((p) => (p.id === id ? { ...p, kot_printing: !p.kot_printing } : p))
    );
  };

  const addCashier = () => {
    const newCashier: AuthorizedCashier = {
      id: Date.now().toString(),
      user: 'New Staff User',
      main_cashier: false,
    };
    setAuthorizedCashiers([...authorizedCashiers, newCashier]);
  };

  const removeCashier = (id: string) => {
    setAuthorizedCashiers(authorizedCashiers.filter((c) => c.id !== id));
  };

  const setMainCashier = (id: string) => {
    setAuthorizedCashiers(
      authorizedCashiers.map((c) => ({
        ...c,
        main_cashier: c.id === id,
      }))
    );
  };

  const tabs: { id: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'general', label: 'General', icon: Building2 },
    { id: 'operations', label: 'Operations', icon: Settings },
    { id: 'printing', label: 'Printing', icon: Printer },
    { id: 'cashiers', label: 'Cashiers', icon: Users },
    { id: 'kot', label: 'Kitchen Order Tickets', icon: UtensilsCrossed },
    { id: 'advanced', label: 'Advanced', icon: Sliders },
  ];

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-semibold shrink-0">
              <SlidersHorizontal className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">POS Profile Settings</h1>
              <p className="text-sm text-gray-500">Configure terminal behavior, printing, authorization, and kitchen dispatch settings.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => window.location.reload()}>
              Discard Changes
            </Button>
            <Button
              className="bg-primary hover:bg-primary-700 text-white flex items-center gap-2"
              onClick={handleSave}
            >
              <Save className="w-4 h-4" />
              Save Profile
            </Button>
          </div>
        </div>

        {saveStatus && (
          <div className="p-4 bg-green-50 border border-green-200 text-green-800 rounded-xl flex items-center gap-2">
            <Check className="w-5 h-5 text-green-600" />
            <span className="text-sm font-medium">{saveStatus}</span>
          </div>
        )}

        {/* Tabs Navigation */}
        <div className="border-b border-gray-200 bg-white rounded-xl shadow-xs p-2">
          <nav className="flex flex-wrap gap-2" aria-label="Tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-primary text-white shadow-xs'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Contents */}
        <Card className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs">
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">General Settings</h3>
                <p className="text-sm text-gray-500">Core identification and site ownership metadata.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Profile Name
                  </label>
                  <Input
                    value={profileName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileName(e.target.value)}
                    placeholder="Enter Profile Name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Branch
                  </label>
                  <Select value={branch} onValueChange={(val: string) => setBranch(val)}>
                    <SelectItem value="Main Branch">Main Branch</SelectItem>
                    <SelectItem value="Downtown Outlet">Downtown Outlet</SelectItem>
                    <SelectItem value="Westside Drive-Thru">Westside Drive-Thru</SelectItem>
                  </Select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Restaurant
                  </label>
                  <Input
                    value={restaurant}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRestaurant(e.target.value)}
                    placeholder="Enter Restaurant Name"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'operations' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Operational Rules</h3>
                <p className="text-sm text-gray-500">Configure POS terminal thresholds, limits, and UI visibility options.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Table Attention Time (minutes)
                  </label>
                  <Input
                    type="number"
                    value={tableAttentionTime}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTableAttentionTime(Number(e.target.value))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Paid Invoice Limit ($)
                  </label>
                  <Input
                    type="number"
                    value={paidInvoiceLimit}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPaidInvoiceLimit(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
                {[
                  {
                    title: 'Enable Discounts',
                    desc: 'Allow POS operators to apply cart or item level discounts.',
                    val: enableDiscounts,
                    set: setEnableDiscounts,
                  },
                  {
                    title: 'Show Item Images',
                    desc: 'Display item thumbnail images on the ordering grid.',
                    val: showItemImages,
                    set: setShowItemImages,
                  },
                  {
                    title: 'Edit Order Type',
                    desc: 'Allow cashiers to toggle order type between Dine-In, Takeaway, and Delivery.',
                    val: editOrderType,
                    set: setEditOrderType,
                  },
                  {
                    title: 'Remove Printed Items',
                    desc: 'Require supervisor override when removing items already sent to kitchen.',
                    val: removePrintedItems,
                    set: setRemovePrintedItems,
                  },
                  {
                    title: 'View All Status',
                    desc: 'Allow seeing orders submitted by other terminals or waitstaff.',
                    val: viewAllStatus,
                    set: setViewAllStatus,
                  },
                  {
                    title: 'Daily POS Close Required',
                    desc: 'Enforce daily closing vouchers before opening a new shift.',
                    val: dailyPosCloseRequired,
                    set: setDailyPosCloseRequired,
                  },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-white hover:bg-gray-50/50">
                    <div>
                      <span className="text-sm font-semibold text-gray-900 block">{item.title}</span>
                      <span className="text-xs text-gray-500">{item.desc}</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.val}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => item.set(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'printing' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Printing Configuration</h3>
                <p className="text-sm text-gray-500">Configure QZ Tray service and routing rules for thermal receipt printers.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-4 rounded-xl border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-gray-900 block">Enable QZ Printing</span>
                    <span className="text-xs text-gray-500">Use QZ Tray client for silent local hardware printing.</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={enableQzPrinting}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnableQzPrinting(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    QZ Host
                  </label>
                  <Input
                    value={qzHost}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQzHost(e.target.value)}
                    placeholder="localhost or 192.168.1.100"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-900">Printer Configuration Table</h4>
                  <Button size="sm" onClick={addPrinter} className="bg-primary text-white hover:bg-primary-700">
                    <Plus className="w-4 h-4 mr-1" /> Add Printer
                  </Button>
                </div>

                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-sm text-gray-600">
                    <thead className="bg-gray-50 text-gray-700 font-medium border-b border-gray-200">
                      <tr>
                        <th className="p-3.5">Printer Name</th>
                        <th className="p-3.5 text-center">Bill Printing</th>
                        <th className="p-3.5 text-center">KOT Printing</th>
                        <th className="p-3.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {printers.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50/50">
                          <td className="p-3.5">
                            <Input
                              value={p.printer}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                setPrinters(
                                  printers.map((item) =>
                                    item.id === p.id ? { ...item, printer: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </td>
                          <td className="p-3.5 text-center">
                            <input
                              type="checkbox"
                              checked={p.bill_printing}
                              onChange={() => togglePrinterBill(p.id)}
                              className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
                            />
                          </td>
                          <td className="p-3.5 text-center">
                            <input
                              type="checkbox"
                              checked={p.kot_printing}
                              onChange={() => togglePrinterKOT(p.id)}
                              className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
                            />
                          </td>
                          <td className="p-3.5 text-right">
                            <button
                              onClick={() => removePrinter(p.id)}
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

          {activeTab === 'cashiers' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Cashier Authorization</h3>
                <p className="text-sm text-gray-500">Manage user permissions and main cashier privileges for this profile.</p>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
                <div>
                  <span className="text-sm font-semibold text-gray-900 block">Enable Multiple Cashiers</span>
                  <span className="text-xs text-gray-500">Allow multiple users to operate this POS profile concurrently.</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableMultipleCashiers}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnableMultipleCashiers(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-900">Authorized Cashiers Table</h4>
                  <Button size="sm" onClick={addCashier} className="bg-primary text-white hover:bg-primary-700">
                    <Plus className="w-4 h-4 mr-1" /> Add Authorized Cashier
                  </Button>
                </div>

                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-sm text-gray-600">
                    <thead className="bg-gray-50 text-gray-700 font-medium border-b border-gray-200">
                      <tr>
                        <th className="p-3.5">User</th>
                        <th className="p-3.5 text-center">Main Cashier</th>
                        <th className="p-3.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {authorizedCashiers.map((c) => (
                        <tr key={c.id} className="hover:bg-gray-50/50">
                          <td className="p-3.5">
                            <Input
                              value={c.user}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                setAuthorizedCashiers(
                                  authorizedCashiers.map((item) =>
                                    item.id === c.id ? { ...item, user: e.target.value } : item
                                  )
                                )
                              }
                            />
                          </td>
                          <td className="p-3.5 text-center">
                            <input
                              type="radio"
                              name="main_cashier"
                              checked={c.main_cashier}
                              onChange={() => setMainCashier(c.id)}
                              className="w-4 h-4 text-primary border-gray-300 focus:ring-primary"
                            />
                          </td>
                          <td className="p-3.5 text-right">
                            <button
                              onClick={() => removeCashier(c.id)}
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

          {activeTab === 'kot' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Kitchen Order Tickets (KOT)</h3>
                <p className="text-sm text-gray-500">Configure ticket numbering, printers, alert audio, and reprint rules.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Naming Series
                  </label>
                  <Input
                    value={namingSeries}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNamingSeries(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Warning Time (minutes)
                  </label>
                  <Input
                    type="number"
                    value={warningTime}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWarningTime(Number(e.target.value))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Parcel Printer
                  </label>
                  <Select value={parcelPrinter} onValueChange={(val: string) => setParcelPrinter(val)}>
                    <SelectItem value="Thermal Printer 1">Thermal Printer 1</SelectItem>
                    <SelectItem value="Kitchen Thermal Printer">Kitchen Thermal Printer</SelectItem>
                    <SelectItem value="Bar Station Printer">Bar Station Printer</SelectItem>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Table Printer
                  </label>
                  <Select value={tablePrinter} onValueChange={(val: string) => setTablePrinter(val)}>
                    <SelectItem value="Kitchen Thermal Printer">Kitchen Thermal Printer</SelectItem>
                    <SelectItem value="Thermal Printer 1">Thermal Printer 1</SelectItem>
                    <SelectItem value="Pass Station Printer">Pass Station Printer</SelectItem>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Reprint Format
                  </label>
                  <Select value={reprintFormat} onValueChange={(val: string) => setReprintFormat(val)}>
                    <SelectItem value="Standard KOT">Standard KOT</SelectItem>
                    <SelectItem value="Detailed KOT with Modifiers">Detailed KOT with Modifiers</SelectItem>
                    <SelectItem value="Compact Ticket">Compact Ticket</SelectItem>
                  </Select>
                </div>
              </div>

              <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
                {[
                  {
                    title: 'Enable Reprint',
                    desc: 'Allow kitchen staff or cashier to re-print KOTs.',
                    val: enableReprint,
                    set: setEnableReprint,
                  },
                  {
                    title: 'Alert Sound',
                    desc: 'Play chime on KDI when new ticket arrives.',
                    val: alertSound,
                    set: setAlertSound,
                  },
                  {
                    title: 'Delay Notifications',
                    desc: 'Delay kitchen notification until order is fully confirmed.',
                    val: delayNotifications,
                    set: setDelayNotifications,
                  },
                  {
                    title: 'Reset Order Number Daily',
                    desc: 'Reset KOT sequence numbers at 00:00 every day.',
                    val: resetOrderNumberDaily,
                    set: setResetOrderNumberDaily,
                  },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-white hover:bg-gray-50/50">
                    <div>
                      <span className="text-sm font-semibold text-gray-900 block">{item.title}</span>
                      <span className="text-xs text-gray-500">{item.desc}</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.val}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => item.set(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'advanced' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Advanced Settings</h3>
                <p className="text-sm text-gray-500">Stock limits, pricing overrides, and customer defaults.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Default Customer
                  </label>
                  <Input
                    value={defaultCustomer}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDefaultCustomer(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Tax Category
                  </label>
                  <Select value={taxCategory} onValueChange={(val: string) => setTaxCategory(val)}>
                    <SelectItem value="Standard Tax">Standard Tax</SelectItem>
                    <SelectItem value="Exempt">Exempt</SelectItem>
                    <SelectItem value="Reduced Rate">Reduced Rate</SelectItem>
                  </Select>
                </div>
              </div>

              <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
                {[
                  {
                    title: 'Allow Custom Rates',
                    desc: 'Allow POS cashiers to manually change item price.',
                    val: allowCustomRates,
                    set: setAllowCustomRates,
                  },
                  {
                    title: 'Auto Select Table',
                    desc: 'Automatically open table layout after order completion.',
                    val: autoSelectTable,
                    set: setAutoSelectTable,
                  },
                  {
                    title: 'Allow Negative Stock',
                    desc: 'Allow placing orders even when inventory count is zero or negative.',
                    val: allowNegativeStock,
                    set: setAllowNegativeStock,
                  },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-white hover:bg-gray-50/50">
                    <div>
                      <span className="text-sm font-semibold text-gray-900 block">{item.title}</span>
                      <span className="text-xs text-gray-500">{item.desc}</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.val}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => item.set(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default POSProfilePage;
