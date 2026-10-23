import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Printer, RefreshCw, Plus, Trash2, AlertCircle, Save } from 'lucide-react';
import {
  Card,
  Button,
  Badge,
  Input,
  Spinner,
  showToast,
  EmptyState,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@ury/ui';
import { Switch } from '../../components/ui/switch';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import { useBranchContext } from '../../context/BranchContext';
import { call } from '@ury/core';

type SectionKey = 'pos_profile' | 'production_unit' | 'room';

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

interface NetworkPrinter {
  name: string;
  server_ip?: string;
  port?: number;
  printer_name?: string;
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

const emptyPosForm = () => ({
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

const emptyUnitForm = () => ({
  production: '',
  department: '',
  printer_settings: [] as PrinterRow[],
});

const emptyRoomForm = () => ({
  printer_settings: [] as PrinterRow[],
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

  const [options, setOptions] = useState<OptionList>(EMPTY_OPTIONS);
  const [networkPrinters, setNetworkPrinters] = useState<NetworkPrinter[]>([]);
  const [records, setRecords] = useState<Record<SectionKey, NamedRecord[]>>({
    pos_profile: [],
    production_unit: [],
    room: [],
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedNames, setSelectedNames] = useState<Record<SectionKey, string>>({
    pos_profile: '',
    production_unit: '',
    room: '',
  });
  const [originals, setOriginals] = useState<Record<SectionKey, string>>({
    pos_profile: '',
    production_unit: '',
    room: '',
  });
  const [docLoading, setDocLoading] = useState<Record<SectionKey, boolean>>({
    pos_profile: false,
    production_unit: false,
    room: false,
  });
  const [savingAll, setSavingAll] = useState<boolean>(false);

  // Form state per section — all values normalized to 0/1 for checks and 1/0 for saves.
  const [posForm, setPosForm] = useState(emptyPosForm);
  const [unitForm, setUnitForm] = useState(emptyUnitForm);
  const [roomForm, setRoomForm] = useState(emptyRoomForm);

  // Network printer modal state.
  const [printerModalOpen, setPrinterModalOpen] = useState<boolean>(false);
  const [printerForm, setPrinterForm] = useState({
    name: '',
    server_ip: 'localhost',
    port: '631',
    printer_name: '',
  });
  const [addingPrinter, setAddingPrinter] = useState<boolean>(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deletingPrinter, setDeletingPrinter] = useState<boolean>(false);

  const activeBranchName = useMemo(() => {
    if (activeBranchId === 'all') return 'All Branches';
    return branches.find((b) => b.id === activeBranchId)?.name || activeBranchId;
  }, [activeBranchId, branches]);

  const branchFilter = useMemo(
    () => (activeBranchId && activeBranchId !== 'all' ? [['branch', '=', activeBranchId]] : []),
    [activeBranchId]
  );

  const applyPrinters = useCallback((list: NetworkPrinter[]) => {
    setNetworkPrinters(list);
    setOptions((prev) => ({ ...prev, printers: toOptions(list) }));
  }, []);

  const loadOptions = useCallback(async (): Promise<OptionList> => {
    const [printFormats, letterHeads, printHeadings, terms] = await Promise.all([
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
      ...EMPTY_OPTIONS,
      printFormats: toOptions(unwrap(printFormats)),
      letterHeads: toOptions(unwrap(letterHeads)),
      printHeadings: toOptions(unwrap(printHeadings)),
      terms: toOptions(unwrap(terms)),
    };
    setOptions(next);
    return next;
  }, []);

  const loadNetworkPrinters = useCallback(async (): Promise<NetworkPrinter[]> => {
    const res = await call('frappe.client.get_list', {
      doctype: 'Network Printer Settings',
      fields: ['name', 'server_ip', 'port', 'printer_name'],
      limit_page_length: 0,
    });
    const list = (unwrap(res) as NetworkPrinter[]) || [];
    applyPrinters(list);
    return list;
  }, [applyPrinters]);

  const loadRecords = useCallback(async (): Promise<Record<SectionKey, NamedRecord[]>> => {
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
    const next: Record<SectionKey, NamedRecord[]> = {
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
        const resolved = await Promise.all([loadOptions(), loadRecords(), loadNetworkPrinters()]);
        const nextRecords = resolved[1];
        // Keep the current selection when it still exists, otherwise fall back
        // to the first record of each list.
        setSelectedNames((prev) => {
          const next = { ...prev };
          (Object.keys(nextRecords) as SectionKey[]).forEach((section) => {
            const list = nextRecords[section];
            if (list.some((r) => r.name === prev[section])) return;
            next[section] = list[0]?.name || '';
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
    [loadOptions, loadRecords, loadNetworkPrinters]
  );

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const refreshPrinters = useCallback(async () => {
    try {
      await loadNetworkPrinters();
    } catch (err) {
      showToast.error(parseFrappeError(err) || 'Failed to refresh network printers');
    }
  }, [loadNetworkPrinters]);

  const snapshotOf = useCallback((section: SectionKey, form: any): string => {
    if (section === 'pos_profile') {
      return JSON.stringify({
        ...form,
        printer_settings: form.printer_settings.map((r: PrinterRow) => normalizeRow(r, false)),
      });
    }
    if (section === 'production_unit') {
      return JSON.stringify({
        ...form,
        printer_settings: form.printer_settings.map((r: PrinterRow) => normalizeRow(r, true)),
      });
    }
    return JSON.stringify({
      ...form,
      printer_settings: form.printer_settings.map((r: PrinterRow) => normalizeRow(r, false)),
    });
  }, []);

  const currentSnapshot = useCallback(
    (section: SectionKey): string => {
      if (section === 'pos_profile') return snapshotOf('pos_profile', posForm);
      if (section === 'production_unit') return snapshotOf('production_unit', unitForm);
      return snapshotOf('room', roomForm);
    },
    [snapshotOf, posForm, unitForm, roomForm]
  );

  const buildPosForm = useCallback((doc: any) => {
    const rows = Array.isArray(doc.printer_settings) ? doc.printer_settings : [];
    return {
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
  }, []);

  const buildUnitForm = useCallback((doc: any) => {
    const rows = Array.isArray(doc.printer_settings) ? doc.printer_settings : [];
    return {
      production: doc.production || doc.name || '',
      department: doc.department || '',
      printer_settings: rows.map((r: any) => ({ name: r.name, ...normalizeRow(r, true) })) as PrinterRow[],
    };
  }, []);

  const buildRoomForm = useCallback((doc: any) => {
    const rows = Array.isArray(doc.printer_settings) ? doc.printer_settings : [];
    return {
      printer_settings: rows.map((r: any) => ({ name: r.name, ...normalizeRow(r, false) })) as PrinterRow[],
    };
  }, []);

  // Fetch the full document (with child rows) whenever a section's selection changes.
  useEffect(() => {
    const name = selectedNames.pos_profile;
    if (!name) {
      setPosForm(emptyPosForm());
      setOriginals((prev) => ({ ...prev, pos_profile: '' }));
      return;
    }
    let cancelled = false;
    (async () => {
      setDocLoading((prev) => ({ ...prev, pos_profile: true }));
      try {
        const res = await call('frappe.client.get', { doctype: 'POS Profile', name });
        if (cancelled) return;
        const doc = unwrap(res) || {};
        const form = buildPosForm(doc);
        setPosForm(form);
        setOriginals((prev) => ({ ...prev, pos_profile: snapshotOf('pos_profile', form) }));
      } catch (err) {
        if (!cancelled) showToast.error(parseFrappeError(err) || 'Failed to load record');
      } finally {
        if (!cancelled) setDocLoading((prev) => ({ ...prev, pos_profile: false }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedNames.pos_profile, buildPosForm, snapshotOf]);

  useEffect(() => {
    const name = selectedNames.production_unit;
    if (!name) {
      setUnitForm(emptyUnitForm());
      setOriginals((prev) => ({ ...prev, production_unit: '' }));
      return;
    }
    let cancelled = false;
    (async () => {
      setDocLoading((prev) => ({ ...prev, production_unit: true }));
      try {
        const res = await call('frappe.client.get', { doctype: 'URY Production Unit', name });
        if (cancelled) return;
        const doc = unwrap(res) || {};
        const form = buildUnitForm(doc);
        setUnitForm(form);
        setOriginals((prev) => ({ ...prev, production_unit: snapshotOf('production_unit', form) }));
      } catch (err) {
        if (!cancelled) showToast.error(parseFrappeError(err) || 'Failed to load record');
      } finally {
        if (!cancelled) setDocLoading((prev) => ({ ...prev, production_unit: false }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedNames.production_unit, buildUnitForm, snapshotOf]);

  useEffect(() => {
    const name = selectedNames.room;
    if (!name) {
      setRoomForm(emptyRoomForm());
      setOriginals((prev) => ({ ...prev, room: '' }));
      return;
    }
    let cancelled = false;
    (async () => {
      setDocLoading((prev) => ({ ...prev, room: true }));
      try {
        const res = await call('frappe.client.get', { doctype: 'URY Room', name });
        if (cancelled) return;
        const doc = unwrap(res) || {};
        const form = buildRoomForm(doc);
        setRoomForm(form);
        setOriginals((prev) => ({ ...prev, room: snapshotOf('room', form) }));
      } catch (err) {
        if (!cancelled) showToast.error(parseFrappeError(err) || 'Failed to load record');
      } finally {
        if (!cancelled) setDocLoading((prev) => ({ ...prev, room: false }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedNames.room, buildRoomForm, snapshotOf]);

  const anyDocLoading = docLoading.pos_profile || docLoading.production_unit || docLoading.room;

  const handleSaveAll = useCallback(async () => {
    if (savingAll || anyDocLoading) return;
    const isPosDirty =
      !!selectedNames.pos_profile && originals.pos_profile !== currentSnapshot('pos_profile');
    const isUnitDirty =
      !!selectedNames.production_unit &&
      originals.production_unit !== currentSnapshot('production_unit');
    const isRoomDirty = !!selectedNames.room && originals.room !== currentSnapshot('room');
    if (!isPosDirty && !isUnitDirty && !isRoomDirty) {
      showToast.warning('No changes in document');
      return;
    }
    setSavingAll(true);
    try {
      await Promise.all([
        isPosDirty
          ? call('frappe.client.set_value', {
              doctype: 'POS Profile',
              name: selectedNames.pos_profile,
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
            })
          : Promise.resolve(),
        isUnitDirty
          ? call('frappe.client.set_value', {
              doctype: 'URY Production Unit',
              name: selectedNames.production_unit,
              fieldname: {
                printer_settings: unitForm.printer_settings.map(rowForSave),
              },
            })
          : Promise.resolve(),
        isRoomDirty
          ? call('frappe.client.set_value', {
              doctype: 'URY Room',
              name: selectedNames.room,
              fieldname: {
                printer_settings: roomForm.printer_settings.map(rowForSave),
              },
            })
          : Promise.resolve(),
      ]);
      setOriginals((prev) => ({
        ...prev,
        ...(isPosDirty ? { pos_profile: currentSnapshot('pos_profile') } : {}),
        ...(isUnitDirty ? { production_unit: currentSnapshot('production_unit') } : {}),
        ...(isRoomDirty ? { room: currentSnapshot('room') } : {}),
      }));
      showToast.success('Printer configuration saved');
    } catch (err) {
      showToast.error(parseFrappeError(err) || 'Failed to save printer settings');
      console.error('Failed to save printer settings', err);
    } finally {
      setSavingAll(false);
    }
  }, [
    savingAll,
    anyDocLoading,
    selectedNames,
    originals,
    currentSnapshot,
    posForm,
    unitForm,
    roomForm,
  ]);

  const handleAddPrinter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addingPrinter) return;
    if (!printerForm.name.trim()) {
      showToast.error('Printer name is required');
      return;
    }
    setAddingPrinter(true);
    try {
      await call('frappe.client.insert', {
        doc: {
          doctype: 'Network Printer Settings',
          name: printerForm.name.trim(),
          server_ip: printerForm.server_ip.trim() || 'localhost',
          port: Number(printerForm.port) || 631,
          printer_name: printerForm.printer_name.trim(),
        },
      });
      showToast.success('Network printer created');
      setPrinterModalOpen(false);
      setPrinterForm({ name: '', server_ip: 'localhost', port: '631', printer_name: '' });
      await refreshPrinters();
    } catch (err) {
      showToast.error(parseFrappeError(err) || 'Failed to create network printer');
    } finally {
      setAddingPrinter(false);
    }
  };

  const handleDeletePrinter = async () => {
    if (!deleteTarget || deletingPrinter) return;
    setDeletingPrinter(true);
    try {
      await call('frappe.client.delete', {
        doctype: 'Network Printer Settings',
        name: deleteTarget,
      });
      showToast.success('Network printer deleted');
      setDeleteTarget(null);
      await refreshPrinters();
    } catch (err) {
      showToast.error(parseFrappeError(err) || 'Failed to delete network printer');
    } finally {
      setDeletingPrinter(false);
    }
  };

  const renderSectionHeader = (title: string, subtitle: string, action?: React.ReactNode) => (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </div>
  );

  const renderPrinterTable = (
    rows: PrinterRow[],
    onChange: (rows: PrinterRow[]) => void,
    { idPrefix, labelPrefix }: { idPrefix: string; labelPrefix: string }
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
                <th className="text-left font-medium text-muted-foreground px-2.5 py-1.5 whitespace-nowrap">Bill</th>
                <th className="text-left font-medium text-muted-foreground px-2.5 py-1.5 whitespace-nowrap">KOT Print</th>
                <th className="text-left font-medium text-muted-foreground px-2.5 py-1.5 whitespace-nowrap">Waiter Print</th>
                <th className="text-left font-medium text-muted-foreground px-2.5 py-1.5 min-w-[180px]">Printer</th>
                <th className="w-10 px-2 py-2" aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.name || idx} className="border-b border-border last:border-b-0">
                  <td className="px-2.5 py-1.5">
                    <Switch
                      aria-label={`${labelPrefix} row ${idx + 1} bill`}
                      checked={row.bill === 1}
                      onCheckedChange={(checked) =>
                        onChange(rows.map((r, i) => (i === idx ? { ...r, bill: checked ? 1 : 0 } : r)))
                      }
                    />
                  </td>
                  <td className="px-2.5 py-1.5">
                    <Switch
                      aria-label={`${labelPrefix} row ${idx + 1} KOT print`}
                      checked={row.custom_kot_print === 1}
                      onCheckedChange={(checked) =>
                        onChange(rows.map((r, i) => (i === idx ? { ...r, custom_kot_print: checked ? 1 : 0 } : r)))
                      }
                    />
                  </td>
                  <td className="px-2.5 py-1.5">
                    <Switch
                      aria-label={`${labelPrefix} row ${idx + 1} waiter print`}
                      checked={row.custom_waiter_print === 1}
                      onCheckedChange={(checked) =>
                        onChange(rows.map((r, i) => (i === idx ? { ...r, custom_waiter_print: checked ? 1 : 0 } : r)))
                      }
                    />
                  </td>
                  <td className="px-2.5 py-1.5">
                    <SearchableSelect
                      id={`${idPrefix}-printer-row-${idx}`}
                      value={row.printer}
                      onChange={(_, value) =>
                        onChange(rows.map((r, i) => (i === idx ? { ...r, printer: value } : r)))
                      }
                      options={withEmpty(options.printers, 'Select Printer')}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`${labelPrefix} delete row ${idx + 1}`}
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

  const renderNetworkPrintersSection = () => (
    <Card className="p-4 space-y-3" data-testid="printer-section-network">
      {renderSectionHeader(
        'Network Printers',
        'Configured CUPS and network printer endpoints.',
        <Button
          type="button"
          variant="outline"
          size="compact"
          onClick={() => setPrinterModalOpen(true)}
          className="text-primary border-primary"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Network Printer
        </Button>
      )}
      {loading ? (
        <div className="py-8 flex justify-center">
          <Spinner className="w-6 h-6 text-primary" hideMessage />
        </div>
      ) : networkPrinters.length === 0 ? (
        <p className="text-sm text-muted-foreground py-3">No network printers configured.</p>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left font-medium text-muted-foreground px-2.5 py-1.5">Printer Name / ID</th>
                <th className="text-left font-medium text-muted-foreground px-2.5 py-1.5">Server IP</th>
                <th className="text-left font-medium text-muted-foreground px-2.5 py-1.5">Port</th>
                <th className="text-left font-medium text-muted-foreground px-2.5 py-1.5">Printer Device Name</th>
                <th className="text-left font-medium text-muted-foreground px-2.5 py-1.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {networkPrinters.map((printer) => (
                <tr key={printer.name} className="border-b border-border last:border-b-0">
                  <td className="px-2.5 py-1.5 font-medium text-foreground">{printer.name}</td>
                  <td className="px-2.5 py-1.5 text-muted-foreground">{printer.server_ip || '—'}</td>
                  <td className="px-2.5 py-1.5 text-muted-foreground">{printer.port ?? '—'}</td>
                  <td className="px-2.5 py-1.5 text-muted-foreground">{printer.printer_name || '—'}</td>
                  <td className="px-2.5 py-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete printer ${printer.name}`}
                      onClick={() => setDeleteTarget(printer.name)}
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
    </Card>
  );

  const renderPosProfileSection = () => (
    <Card className="p-4 space-y-3" data-testid="printer-section-pos-profile">
      {renderSectionHeader(
        'POS Profile Printer Settings',
        'Configure invoice, receipt, and QZ printing for POS profiles.'
      )}
      {records.pos_profile.length === 0 ? (
        <EmptyState
          icon={Printer}
          title="No POS Profiles for this branch"
          description={`There are no pos profiles assigned to ${activeBranchName}.`}
        />
      ) : (
        <>
          <div className="max-w-md">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">POS Profile</label>
            <SearchableSelect
              id="pos-profile-selector"
              value={selectedNames.pos_profile}
              onChange={(_, value) => {
                if (value) setSelectedNames((prev) => ({ ...prev, pos_profile: value }));
              }}
              options={withEmpty(
                records.pos_profile.map((r) => ({ value: r.name, label: r.name })),
                'Select POS Profile'
              )}
            />
          </div>
          {docLoading.pos_profile ? (
            <div className="py-8 flex justify-center">
              <Spinner className="w-6 h-6 text-primary" hideMessage />
            </div>
          ) : (
            <>
              <div className="space-y-3 pt-2 border-t border-border">
                <h3 className="text-sm font-semibold text-foreground">Standard Print Settings</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
              </div>

              <div className="space-y-3 pt-3 border-t border-border">
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
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
              </div>

              <div className="pt-3 border-t border-border">
                {renderPrinterTable(posForm.printer_settings, (rows) => setPosForm((prev) => ({ ...prev, printer_settings: rows })), {
                  idPrefix: 'pos',
                  labelPrefix: 'POS',
                })}
              </div>
            </>
          )}
        </>
      )}
    </Card>
  );

  const renderProductionUnitSection = () => (
    <Card className="p-4 space-y-3" data-testid="printer-section-production-unit">
      {renderSectionHeader(
        'URY Production Unit Printer Settings',
        'Configure KOT and order routing printers for kitchen and bar production units.'
      )}
      {records.production_unit.length === 0 ? (
        <EmptyState
          icon={Printer}
          title="No Production Units for this branch"
          description={`There are no production units assigned to ${activeBranchName}.`}
        />
      ) : (
        <>
          <div className="max-w-md">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Production Unit</label>
            <SearchableSelect
              id="unit-selector"
              value={selectedNames.production_unit}
              onChange={(_, value) => {
                if (value) setSelectedNames((prev) => ({ ...prev, production_unit: value }));
              }}
              options={withEmpty(
                records.production_unit.map((r) => ({ value: r.name, label: r.name })),
                'Select Production Unit'
              )}
            />
          </div>
          {docLoading.production_unit ? (
            <div className="py-8 flex justify-center">
              <Spinner className="w-6 h-6 text-primary" hideMessage />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{unitForm.production || selectedNames.production_unit}</Badge>
                {unitForm.department && <Badge variant="info">{unitForm.department}</Badge>}
              </div>
              {renderPrinterTable(unitForm.printer_settings, (rows) => setUnitForm((prev) => ({ ...prev, printer_settings: rows })), {
                idPrefix: 'unit',
                labelPrefix: 'Unit',
              })}
            </>
          )}
        </>
      )}
    </Card>
  );

  const renderRoomSection = () => (
    <Card className="p-4 space-y-3" data-testid="printer-section-room">
      {renderSectionHeader(
        'URY Room Printer Settings',
        'Configure dining area, hall, and room printer routing.'
      )}
      {records.room.length === 0 ? (
        <EmptyState
          icon={Printer}
          title="No Rooms for this branch"
          description={`There are no rooms assigned to ${activeBranchName}.`}
        />
      ) : (
        <>
          <div className="max-w-md">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Room</label>
            <SearchableSelect
              id="room-selector"
              value={selectedNames.room}
              onChange={(_, value) => {
                if (value) setSelectedNames((prev) => ({ ...prev, room: value }));
              }}
              options={withEmpty(
                records.room.map((r) => ({ value: r.name, label: r.name })),
                'Select Room'
              )}
            />
          </div>
          {docLoading.room ? (
            <div className="py-8 flex justify-center">
              <Spinner className="w-6 h-6 text-primary" hideMessage />
            </div>
          ) : (
            <>
              {renderPrinterTable(roomForm.printer_settings, (rows) => setRoomForm((prev) => ({ ...prev, printer_settings: rows })), {
                idPrefix: 'room',
                labelPrefix: 'Room',
              })}
            </>
          )}
        </>
      )}
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-3 border-b border-border -mx-6 px-6 -mt-6 pt-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Printer Configuration</h1>
          <p className="text-sm text-muted-foreground">
            Manage network printers and printer assignments across POS Profiles, Production Units, and Rooms.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleSaveAll}
            disabled={savingAll || anyDocLoading}
            className="bg-primary hover:bg-primary/90 text-white font-semibold shadow-xs min-w-[140px]"
          >
            {savingAll ? <Spinner className="w-4 h-4" hideMessage /> : <Save className="w-4 h-4" />}
            Save Changes
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <div className="space-y-4">
            {renderNetworkPrintersSection()}
            {renderProductionUnitSection()}
            {renderRoomSection()}
          </div>
          <div className="space-y-4">{renderPosProfileSection()}</div>
        </div>
        </>
      )}

      {/* Add Network Printer modal */}
      <Dialog open={printerModalOpen} onOpenChange={(open) => !open && setPrinterModalOpen(false)}>
        <DialogContent className="max-w-md bg-card p-6 rounded-xl border border-border shadow-xl" onClose={() => setPrinterModalOpen(false)}>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-foreground">Add Network Printer</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddPrinter} className="space-y-4 text-sm mt-4">
            <div>
              <label className="block font-semibold text-foreground mb-1.5">
                Printer Name / ID <span className="text-red-500">*</span>
              </label>
              <Input
                id="np-name"
                value={printerForm.name}
                onChange={(e) => setPrinterForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Kitchen Printer"
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-foreground mb-1.5">Server IP</label>
              <Input
                id="np-server-ip"
                value={printerForm.server_ip}
                onChange={(e) => setPrinterForm((prev) => ({ ...prev, server_ip: e.target.value }))}
                placeholder="localhost"
              />
            </div>
            <div>
              <label className="block font-semibold text-foreground mb-1.5">Port</label>
              <Input
                id="np-port"
                type="number"
                value={printerForm.port}
                onChange={(e) => setPrinterForm((prev) => ({ ...prev, port: e.target.value }))}
                placeholder="631"
              />
            </div>
            <div>
              <label className="block font-semibold text-foreground mb-1.5">
                Printer Device Name <span className="text-red-500">*</span>
              </label>
              <Input
                id="np-printer-name"
                value={printerForm.printer_name}
                onChange={(e) => setPrinterForm((prev) => ({ ...prev, printer_name: e.target.value }))}
                placeholder="e.g. EPSON_TM-T88VI"
                required
              />
            </div>
            <div className="pt-6 flex justify-end gap-3 border-t mt-6 border-border">
              <Button type="button" variant="outline" onClick={() => setPrinterModalOpen(false)} disabled={addingPrinter} className="font-semibold">
                Cancel
              </Button>
              <Button type="submit" disabled={addingPrinter} className="bg-primary hover:bg-primary/90 text-white font-semibold shadow-xs disabled:opacity-50 disabled:cursor-not-allowed">
                {addingPrinter ? <Spinner className="w-4 h-4" hideMessage /> : <Plus className="w-4 h-4" />}
                <span>Add Printer</span>
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Network Printer confirmation */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md bg-card p-6 rounded-xl border border-border shadow-xl" onClose={() => setDeleteTarget(null)}>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-foreground">Delete Network Printer</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mt-4">
            Are you sure you want to delete <span className="font-semibold text-foreground">{deleteTarget}</span>? Printer
            assignments referencing it will need to be reconfigured.
          </p>
          <div className="pt-6 flex justify-end gap-3 border-t mt-6 border-border">
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)} disabled={deletingPrinter} className="font-semibold">
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleDeletePrinter}
              disabled={deletingPrinter}
              className="bg-destructive hover:bg-destructive/90 text-white font-semibold shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deletingPrinter ? <Spinner className="w-4 h-4" hideMessage /> : <Trash2 className="w-4 h-4" />}
              <span>Delete</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PrinterConfigPage;
