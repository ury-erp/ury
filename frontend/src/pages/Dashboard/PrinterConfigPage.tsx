import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Printer, RefreshCw, Plus, Trash2, AlertCircle, Save } from 'lucide-react';
import {
  Card,
  Button,
  Badge,
  Input,
  Spinner,
  showToast,
  SegmentedControl,
  EmptyState,
} from '@ury/ui';
import { Switch } from '../../components/ui/switch';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import { useBranchContext } from '../../context/BranchContext';
import { dashboardService } from '../../services/dashboard';
import { call } from '@ury/core';

type ConfigTab = 'pos_profile' | 'production_unit' | 'room';

const TAB_DOCTYPES: Record<ConfigTab, string> = {
  pos_profile: 'POS Profile',
  production_unit: 'URY Production Unit',
  room: 'URY Room',
};

const TAB_LABELS: Record<ConfigTab, string> = {
  pos_profile: 'POS Profile',
  production_unit: 'Production Unit',
  room: 'Room',
};

/** Effective child-row schema of the shared `URY Printer Settings` table. */
interface PrinterRow {
  name?: string;
  bill: number;
  custom_kot_print: number;
  custom_waiter_print: number;
  printer: string;
  custom_kot_print_format: string;
  custom_waiter_print_format: string;
  custom_block_takeaway_kot?: number;
}

interface NamedRecord {
  name: string;
  branch?: string;
  [key: string]: unknown;
}

interface OptionList {
  printers: { value: string; label: string }[];
  printFormats: { value: string; label: string }[];
  letterHeads: { value: string; label: string }[];
  printHeadings: { value: string; label: string }[];
  terms: { value: string; label: string }[];
}

const EMPTY_OPTIONS: OptionList = {
  printers: [],
  printFormats: [],
  letterHeads: [],
  printHeadings: [],
  terms: [],
};

const emptyRow = (): PrinterRow => ({
  bill: 1,
  custom_kot_print: 0,
  custom_waiter_print: 0,
  printer: '',
  custom_kot_print_format: '',
  custom_waiter_print_format: '',
  custom_block_takeaway_kot: 0,
});

/** Fixed key order so `JSON.stringify` comparison is stable. */
const normalizeRow = (row: Partial<PrinterRow>, withBlockTakeaway: boolean): PrinterRow => {
  const normalized: PrinterRow = {
    bill: row.bill ? 1 : 0,
    custom_kot_print: row.custom_kot_print ? 1 : 0,
    custom_waiter_print: row.custom_waiter_print ? 1 : 0,
    printer: row.printer || '',
    custom_kot_print_format: row.custom_kot_print_format || '',
    custom_waiter_print_format: row.custom_waiter_print_format || '',
  };
  if (withBlockTakeaway) {
    normalized.custom_block_takeaway_kot = row.custom_block_takeaway_kot ? 1 : 0;
  }
  return normalized;
};

/** Strip client-side noise but keep Frappe row `name`s so set_value updates existing children. */
const rowForSave = (row: PrinterRow): Record<string, unknown> => ({
  ...(row.name ? { name: row.name } : {}),
  ...normalizeRow(row, row.custom_block_takeaway_kot !== undefined),
});

const parseFrappeError = (err: any): string => {
  let msg = err?.message || 'An error occurred';
  if (err?._server_messages) {
    try {
      const messages = JSON.parse(err._server_messages).map((m: any) => {
        const parsed = JSON.parse(m);
        return parsed.message;
      });
      if (messages.length > 0) {
        msg = messages.join(' | ');
      }
    } catch (e) {}
  } else if (err?.exc_type) {
    msg = err.exc_type;
  }
  return msg.replace(/<[^>]*>?/gm, '');
};

const unwrap = (res: any): any => res?.message ?? res;

const toOptions = (records: any[]): { value: string; label: string }[] =>
  (records || [])
    .map((r) => ({ value: r.name ?? '', label: r.name ?? '' }))
    .filter((o) => o.value !== '');

const withEmpty = (options: { value: string; label: string }[], placeholder: string) => [
  { value: '', label: placeholder },
  ...options,
];

export const PrinterConfigPage: React.FC = () => {
  const { activeBranchId, branches = [] } = useBranchContext();

  const [activeTab, setActiveTab] = useState<ConfigTab>('pos_profile');
  const [options, setOptions] = useState<OptionList>(EMPTY_OPTIONS);
  const [records, setRecords] = useState<Record<ConfigTab, NamedRecord[]>>({
    pos_profile: [],
    production_unit: [],
    room: [],
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedNames, setSelectedNames] = useState<Record<ConfigTab, string>>({
    pos_profile: '',
    production_unit: '',
    room: '',
  });
  const [docLoading, setDocLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // Form state per tab — all values normalized to 0/1 for checks and 1/0 for saves.
  const [posForm, setPosForm] = useState({
    print_format: '',
    letter_head: '',
    tc_name: '',
    select_print_heading: '',
    qz_print: false,
    qz_host: '',
    custom_enable_kot_reprint: false,
    custom_reprint_kot_format: '',
    custom_table_order_printer: '',
    custom_parcel_order_printer: '',
    printer_settings: [] as PrinterRow[],
  });
  const [unitForm, setUnitForm] = useState({
    production: '',
    department: '',
    printer_settings: [] as PrinterRow[],
  });
  const [roomForm, setRoomForm] = useState({
    kot_printing: false,
    block_takeaway: false,
    print_format: '',
    printer_settings: [] as PrinterRow[],
  });
  const [original, setOriginal] = useState<string>('');

  const activeBranchName = useMemo(() => {
    if (activeBranchId === 'all') return 'All Branches';
    return branches.find((b) => b.id === activeBranchId)?.name || activeBranchId;
  }, [activeBranchId, branches]);

  const branchFilter = useMemo(
    () => (activeBranchId && activeBranchId !== 'all' ? [['branch', '=', activeBranchId]] : []),
    [activeBranchId]
  );

  const loadOptions = useCallback(async (): Promise<OptionList> => {
    const [printers, printFormats, letterHeads, printHeadings, terms] = await Promise.all([
      dashboardService.getModuleRecords<{ name: string }>('Network Printer Settings', 'all'),
      call('frappe.client.get_list', {
        doctype: 'Print Format',
        fields: ['name', 'doc_type'],
        limit_page_length: 0,
      }),
      call('frappe.client.get_list', { doctype: 'Letter Head', fields: ['name'] }),
      call('frappe.client.get_list', { doctype: 'Print Heading', fields: ['name'] }),
      call('frappe.client.get_list', { doctype: 'Terms and Conditions', fields: ['name'] }),
    ]);
    const next: OptionList = {
      printers: toOptions(printers),
      printFormats: toOptions(unwrap(printFormats)),
      letterHeads: toOptions(unwrap(letterHeads)),
      printHeadings: toOptions(unwrap(printHeadings)),
      terms: toOptions(unwrap(terms)),
    };
    setOptions(next);
    return next;
  }, []);

  const loadRecords = useCallback(async (): Promise<Record<ConfigTab, NamedRecord[]>> => {
    const [profiles, units, rooms] = await Promise.all([
      call('frappe.client.get_list', {
        doctype: 'POS Profile',
        filters: branchFilter,
        fields: ['name', 'branch', 'print_format'],
        limit_page_length: 0,
      }),
      call('frappe.client.get_list', {
        doctype: 'URY Production Unit',
        filters: branchFilter,
        fields: ['name', 'production', 'department', 'branch'],
        limit_page_length: 0,
      }),
      call('frappe.client.get_list', {
        doctype: 'URY Room',
        filters: branchFilter,
        fields: ['name', 'room_type', 'branch'],
        limit_page_length: 0,
      }),
    ]);
    const next: Record<ConfigTab, NamedRecord[]> = {
      pos_profile: (unwrap(profiles) as NamedRecord[]) || [],
      production_unit: (unwrap(units) as NamedRecord[]) || [],
      room: (unwrap(rooms) as NamedRecord[]) || [],
    };
    setRecords(next);
    return next;
  }, [branchFilter]);

  const loadAll = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const nextRecords = await Promise.all([loadOptions(), loadRecords()]);
        const resolved = nextRecords[1];
        // Keep the current selection when it still exists, otherwise fall back
        // to the first record of each list.
        setSelectedNames((prev) => {
          const next = { ...prev };
          (Object.keys(resolved) as ConfigTab[]).forEach((tab) => {
            const list = resolved[tab];
            if (list.some((r) => r.name === prev[tab])) return;
            next[tab] = list[0]?.name || '';
          });
          return next;
        });
      } catch (err) {
        console.error('Failed to load printer config data', err);
        setError(parseFrappeError(err) || 'Failed to load printer configuration');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadOptions, loadRecords]
  );

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Fetch the full document (with child rows) whenever the tab selection changes.
  useEffect(() => {
    const name = selectedNames[activeTab];
    if (!name) {
      setOriginal('');
      return;
    }
    let cancelled = false;
    (async () => {
      setDocLoading(true);
      try {
        const res = await call('frappe.client.get', {
          doctype: TAB_DOCTYPES[activeTab],
          name,
        });
        const doc = unwrap(res) || {};
        if (cancelled) return;
        const rows = Array.isArray(doc.printer_settings) ? doc.printer_settings : [];
        if (activeTab === 'pos_profile') {
          const form = {
            print_format: doc.print_format || '',
            letter_head: doc.letter_head || '',
            tc_name: doc.tc_name || '',
            select_print_heading: doc.select_print_heading || '',
            qz_print: doc.qz_print === 1,
            qz_host: doc.qz_host || '',
            custom_enable_kot_reprint: doc.custom_enable_kot_reprint === 1,
            custom_reprint_kot_format: doc.custom_reprint_kot_format || '',
            custom_table_order_printer: doc.custom_table_order_printer || '',
            custom_parcel_order_printer: doc.custom_parcel_order_printer || '',
            printer_settings: rows.map((r: any) => ({ name: r.name, ...normalizeRow(r, false) })) as PrinterRow[],
          };
          setPosForm(form);
          setOriginal(JSON.stringify({ ...form, printer_settings: form.printer_settings.map((r) => normalizeRow(r, false)) }));
        } else if (activeTab === 'production_unit') {
          const form = {
            production: doc.production || doc.name || '',
            department: doc.department || '',
            printer_settings: rows.map((r: any) => ({ name: r.name, ...normalizeRow(r, true) })) as PrinterRow[],
          };
          setUnitForm(form);
          setOriginal(JSON.stringify({ ...form, printer_settings: form.printer_settings.map((r) => normalizeRow(r, true)) }));
        } else {
          const form = {
            kot_printing: doc.kot_printing === 1,
            block_takeaway: doc.block_takeaway === 1,
            print_format: doc.print_format || '',
            printer_settings: rows.map((r: any) => ({ name: r.name, ...normalizeRow(r, false) })) as PrinterRow[],
          };
          setRoomForm(form);
          setOriginal(JSON.stringify({ ...form, printer_settings: form.printer_settings.map((r) => normalizeRow(r, false)) }));
        }
      } catch (err) {
        if (!cancelled) {
          showToast.error(parseFrappeError(err) || 'Failed to load record');
        }
      } finally {
        if (!cancelled) setDocLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, selectedNames]);

  const currentSnapshot = (): string => {
    if (activeTab === 'pos_profile') {
      return JSON.stringify({
        ...posForm,
        printer_settings: posForm.printer_settings.map((r) => normalizeRow(r, false)),
      });
    }
    if (activeTab === 'production_unit') {
      return JSON.stringify({
        ...unitForm,
        printer_settings: unitForm.printer_settings.map((r) => normalizeRow(r, true)),
      });
    }
    return JSON.stringify({
      ...roomForm,
      printer_settings: roomForm.printer_settings.map((r) => normalizeRow(r, false)),
    });
  };

  const handleSave = async () => {
    const name = selectedNames[activeTab];
    if (!name || saving) return;
    if (JSON.stringify(original) === currentSnapshot()) {
      showToast.warning('No changes in document');
      return;
    }
    setSaving(true);
    try {
      if (activeTab === 'pos_profile') {
        await call('frappe.client.set_value', {
          doctype: 'POS Profile',
          name,
          fieldname: {
            print_format: posForm.print_format,
            letter_head: posForm.letter_head,
            tc_name: posForm.tc_name,
            select_print_heading: posForm.select_print_heading,
            qz_print: posForm.qz_print ? 1 : 0,
            qz_host: posForm.qz_host,
            custom_enable_kot_reprint: posForm.custom_enable_kot_reprint ? 1 : 0,
            custom_reprint_kot_format: posForm.custom_reprint_kot_format,
            custom_table_order_printer: posForm.custom_table_order_printer,
            custom_parcel_order_printer: posForm.custom_parcel_order_printer,
            printer_settings: posForm.printer_settings.map(rowForSave),
          },
        });
      } else if (activeTab === 'production_unit') {
        await call('frappe.client.set_value', {
          doctype: 'URY Production Unit',
          name,
          fieldname: {
            printer_settings: unitForm.printer_settings.map(rowForSave),
          },
        });
      } else {
        await call('frappe.client.set_value', {
          doctype: 'URY Room',
          name,
          fieldname: {
            kot_printing: roomForm.kot_printing ? 1 : 0,
            block_takeaway: roomForm.block_takeaway ? 1 : 0,
            print_format: roomForm.print_format,
            printer_settings: roomForm.printer_settings.map(rowForSave),
          },
        });
      }
      showToast.success(`${TAB_LABELS[activeTab]} printer settings saved`);
      setOriginal(currentSnapshot());
    } catch (err) {
      showToast.error(parseFrappeError(err) || 'Failed to save printer settings');
      console.error('Failed to save printer settings', err);
    } finally {
      setSaving(false);
    }
  };

  const tabRecords = records[activeTab];
  const selectedName = selectedNames[activeTab];
  const hasRecords = tabRecords.length > 0;

  const renderSelector = () => (
    <Card className="p-4">
      <div className="flex flex-col md:flex-row md:items-end gap-4">
        <div className="flex-1 min-w-0">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            {TAB_LABELS[activeTab]}
          </label>
          <SearchableSelect
            id="record-selector"
            value={selectedName}
            onChange={(_, value) => {
              if (value) setSelectedNames((prev) => ({ ...prev, [activeTab]: value }));
            }}
            options={withEmpty(
              tabRecords.map((r) => ({ value: r.name, label: r.name })),
              `Select ${TAB_LABELS[activeTab]}`
            )}
          />
        </div>
      </div>
    </Card>
  );

  const renderPrinterTable = (
    rows: PrinterRow[],
    onChange: (rows: PrinterRow[]) => void,
    { withFormats = false, withBlockTakeaway = false }: { withFormats?: boolean; withBlockTakeaway?: boolean } = {}
  ) => (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Printers</h3>
        <Button
          type="button"
          variant="outline"
          size="compact"
          onClick={() => onChange([...rows, emptyRow()])}
          className="text-primary border-primary"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Row
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-3">No printers configured. Add a row to assign printers.</p>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">Bill</th>
                <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">KOT Print</th>
                <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">Waiter Print</th>
                <th className="text-left font-medium text-muted-foreground px-3 py-2 min-w-[180px]">Printer</th>
                {withFormats && (
                  <>
                    <th className="text-left font-medium text-muted-foreground px-3 py-2 min-w-[160px]">KOT Format</th>
                    <th className="text-left font-medium text-muted-foreground px-3 py-2 min-w-[160px]">Waiter Format</th>
                  </>
                )}
                {withBlockTakeaway && (
                  <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">Block Takeaway KOT</th>
                )}
                <th className="w-10 px-2 py-2" aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.name || idx} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2">
                    <Switch
                      aria-label={`Row ${idx + 1} bill`}
                      checked={row.bill === 1}
                      onCheckedChange={(checked) =>
                        onChange(rows.map((r, i) => (i === idx ? { ...r, bill: checked ? 1 : 0 } : r)))
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Switch
                      aria-label={`Row ${idx + 1} KOT print`}
                      checked={row.custom_kot_print === 1}
                      onCheckedChange={(checked) =>
                        onChange(rows.map((r, i) => (i === idx ? { ...r, custom_kot_print: checked ? 1 : 0 } : r)))
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Switch
                      aria-label={`Row ${idx + 1} waiter print`}
                      checked={row.custom_waiter_print === 1}
                      onCheckedChange={(checked) =>
                        onChange(rows.map((r, i) => (i === idx ? { ...r, custom_waiter_print: checked ? 1 : 0 } : r)))
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <SearchableSelect
                      id={`printer-row-${idx}`}
                      value={row.printer}
                      onChange={(_, value) =>
                        onChange(rows.map((r, i) => (i === idx ? { ...r, printer: value } : r)))
                      }
                      options={withEmpty(options.printers, 'Select Printer')}
                    />
                  </td>
                  {withFormats && (
                    <>
                      <td className="px-3 py-2">
                        <SearchableSelect
                          id={`kot-format-row-${idx}`}
                          value={row.custom_kot_print_format}
                          onChange={(_, value) =>
                            onChange(rows.map((r, i) => (i === idx ? { ...r, custom_kot_print_format: value } : r)))
                          }
                          options={withEmpty(options.printFormats, 'Select KOT Format')}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <SearchableSelect
                          id={`waiter-format-row-${idx}`}
                          value={row.custom_waiter_print_format}
                          onChange={(_, value) =>
                            onChange(rows.map((r, i) => (i === idx ? { ...r, custom_waiter_print_format: value } : r)))
                          }
                          options={withEmpty(options.printFormats, 'Select Waiter Format')}
                        />
                      </td>
                    </>
                  )}
                  {withBlockTakeaway && (
                    <td className="px-3 py-2">
                      <Switch
                        aria-label={`Row ${idx + 1} block takeaway KOT`}
                        checked={row.custom_block_takeaway_kot === 1}
                        disabled={row.custom_kot_print !== 1}
                        onCheckedChange={(checked) =>
                          onChange(
                            rows.map((r, i) => (i === idx ? { ...r, custom_block_takeaway_kot: checked ? 1 : 0 } : r))
                          )
                        }
                      />
                    </td>
                  )}
                  <td className="px-2 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete row ${idx + 1}`}
                      onClick={() => onChange(rows.filter((_, i) => i !== idx))}
                      className="text-destructive hover:text-destructive/80 h-8 w-8"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderPosProfileForm = () => (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Standard Print Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Print Format</label>
            <SearchableSelect
              id="print_format"
              value={posForm.print_format}
              onChange={(_, value) => setPosForm((prev) => ({ ...prev, print_format: value }))}
              options={withEmpty(options.printFormats, 'Select Print Format')}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Letter Head</label>
            <SearchableSelect
              id="letter_head"
              value={posForm.letter_head}
              onChange={(_, value) => setPosForm((prev) => ({ ...prev, letter_head: value }))}
              options={withEmpty(options.letterHeads, 'Select Letter Head')}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Terms and Conditions</label>
            <SearchableSelect
              id="tc_name"
              value={posForm.tc_name}
              onChange={(_, value) => setPosForm((prev) => ({ ...prev, tc_name: value }))}
              options={withEmpty(options.terms, 'Select Terms and Conditions')}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Print Heading</label>
            <SearchableSelect
              id="select_print_heading"
              value={posForm.select_print_heading}
              onChange={(_, value) => setPosForm((prev) => ({ ...prev, select_print_heading: value }))}
              options={withEmpty(options.printHeadings, 'Select Print Heading')}
            />
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Hardware / QZ Settings</h3>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-foreground">QZ Print</p>
            <p className="text-xs text-muted-foreground">Print through a local QZ Tray client instead of network printers.</p>
          </div>
          <Switch
            id="qz_print"
            aria-label="QZ Print"
            checked={posForm.qz_print}
            onCheckedChange={(checked) => setPosForm((prev) => ({ ...prev, qz_print: checked }))}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">QZ Host</label>
          <Input
            id="qz_host"
            value={posForm.qz_host}
            onChange={(e) => setPosForm((prev) => ({ ...prev, qz_host: e.target.value }))}
            placeholder="localhost"
            disabled={!posForm.qz_print}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-foreground">Enable KOT Reprint</p>
            <p className="text-xs text-muted-foreground">Allow reprinting KOTs for table and parcel orders.</p>
          </div>
          <Switch
            id="custom_enable_kot_reprint"
            aria-label="Enable KOT Reprint"
            checked={posForm.custom_enable_kot_reprint}
            onCheckedChange={(checked) => setPosForm((prev) => ({ ...prev, custom_enable_kot_reprint: checked }))}
          />
        </div>
        {posForm.custom_enable_kot_reprint && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Reprint KOT Format</label>
              <SearchableSelect
                id="custom_reprint_kot_format"
                value={posForm.custom_reprint_kot_format}
                onChange={(_, value) => setPosForm((prev) => ({ ...prev, custom_reprint_kot_format: value }))}
                options={withEmpty(options.printFormats, 'Select Print Format')}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Table Order Printer</label>
              <SearchableSelect
                id="custom_table_order_printer"
                value={posForm.custom_table_order_printer}
                onChange={(_, value) => setPosForm((prev) => ({ ...prev, custom_table_order_printer: value }))}
                options={withEmpty(options.printers, 'Select Printer')}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Parcel Order Printer</label>
              <SearchableSelect
                id="custom_parcel_order_printer"
                value={posForm.custom_parcel_order_printer}
                onChange={(_, value) => setPosForm((prev) => ({ ...prev, custom_parcel_order_printer: value }))}
                options={withEmpty(options.printers, 'Select Printer')}
              />
            </div>
          </div>
        )}
      </Card>

      <Card className="p-4">{renderPrinterTable(posForm.printer_settings, (rows) => setPosForm((prev) => ({ ...prev, printer_settings: rows })))}</Card>
    </div>
  );

  const renderProductionUnitForm = () => (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{unitForm.production || selectedName}</Badge>
        {unitForm.department && <Badge variant="info">{unitForm.department}</Badge>}
      </div>
      {renderPrinterTable(unitForm.printer_settings, (rows) => setUnitForm((prev) => ({ ...prev, printer_settings: rows })), {
        withFormats: true,
        withBlockTakeaway: true,
      })}
    </Card>
  );

  const renderRoomForm = () => (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-foreground">Enable KOT Printing</p>
            <p className="text-xs text-muted-foreground">Fire KOTs to this room's printers when orders are placed.</p>
          </div>
          <Switch
            id="kot_printing"
            aria-label="Enable KOT Printing"
            checked={roomForm.kot_printing}
            onCheckedChange={(checked) => setRoomForm((prev) => ({ ...prev, kot_printing: checked }))}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-foreground">Block Takeaway Orders</p>
            <p className="text-xs text-muted-foreground">Prevent takeaway and delivery orders from printing through this room.</p>
          </div>
          <Switch
            id="block_takeaway"
            aria-label="Block Takeaway Orders"
            checked={roomForm.block_takeaway}
            onCheckedChange={(checked) => setRoomForm((prev) => ({ ...prev, block_takeaway: checked }))}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Print Format</label>
          <SearchableSelect
            id="room_print_format"
            value={roomForm.print_format}
            onChange={(_, value) => setRoomForm((prev) => ({ ...prev, print_format: value }))}
            options={withEmpty(options.printFormats, 'Select Print Format')}
          />
        </div>
      </Card>

      <Card className="p-4">{renderPrinterTable(roomForm.printer_settings, (rows) => setRoomForm((prev) => ({ ...prev, printer_settings: rows })), { withFormats: true })}</Card>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-3 border-b border-border -mx-6 px-6 -mt-6 pt-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Printer Config</h1>
          <p className="text-sm text-muted-foreground">Manage printer settings for the selected branch.</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="gap-1.5">
            <Printer className="w-3 h-3" />
            {activeBranchName}
          </Badge>
          <Button variant="outline" onClick={() => loadAll(true)} disabled={loading || refreshing}>
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-16">
          <Spinner className="w-8 h-8 text-primary" hideMessage />
        </div>
      ) : error ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <AlertCircle className="w-6 h-6 text-destructive" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">Failed to load printer configuration</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm">{error}</p>
          <Button variant="outline" onClick={() => loadAll(true)}>
            <RefreshCw className="w-4 h-4" />
            Retry
          </Button>
        </Card>
      ) : (
        <>
          <SegmentedControl<ConfigTab>
            aria-label="Printer configuration type"
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { value: 'pos_profile', label: 'POS Profile' },
              { value: 'production_unit', label: 'Production Unit' },
              { value: 'room', label: 'Room' },
            ]}
          />

          {!hasRecords ? (
            <Card className="p-6">
              <EmptyState
                icon={Printer}
                title={`No ${TAB_LABELS[activeTab]}s for this branch`}
                description={`There are no ${TAB_LABELS[activeTab].toLowerCase()} records assigned to ${activeBranchName}.`}
              />
            </Card>
          ) : (
            <>
              {renderSelector()}
              {docLoading ? (
                <div className="py-12">
                  <Spinner className="w-8 h-8 text-primary" hideMessage />
                </div>
              ) : (
                <>
                  {activeTab === 'pos_profile' && renderPosProfileForm()}
                  {activeTab === 'production_unit' && renderProductionUnitForm()}
                  {activeTab === 'room' && renderRoomForm()}

                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={handleSave}
                      disabled={saving || docLoading}
                      className="bg-primary hover:bg-primary/90 text-white font-semibold shadow-xs min-w-[140px]"
                    >
                      {saving ? (
                        <Spinner className="w-4 h-4" hideMessage />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Save Changes
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default PrinterConfigPage;
