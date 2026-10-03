import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChefHat,
  Download,
  Plug,
  Printer,
  Receipt,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { call, listQzPrinters, parseFrappeError, printWithQz } from '@ury/core';
import { Button, Card, Input, Spinner, showToast } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import { t } from '../../i18n';

/**
 * Link the branch's printers to QZ Tray.
 *
 * One computer at the restaurant runs QZ Tray with every printer installed on
 * it. This page connects to it, lists what it sees, and records which
 * printer prints bills and which prints each kitchen's tickets. Printing then
 * goes through the server's queue (ury.ury.api.qz_printing), picked up by
 * the POS screen on that computer.
 */

const API = 'ury.ury.api.qz_printing';

interface Setup {
  pos_profile: string | null;
  qz_enabled: number;
  qz_host: string;
  bill_printer: string | null;
  kitchens: { name: string; qz_printer: string | null }[];
  certificate_ready: boolean;
  queue: { pending: number; failed: number };
  failed_jobs: { name: string; reference_doctype: string; reference_name: string; printer: string; error?: string; modified: string }[];
}

const unwrap = <T,>(res: unknown): T => ((res as { message?: T })?.message ?? res) as T;

interface PrinterRowProps {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  enabled: boolean;
  testing: boolean;
  onTest: (printer: string) => void;
}

// Outside the page component: defined inside, it would be a new component on
// every render and its input would lose focus after each keystroke.
const PrinterRow: React.FC<PrinterRowProps> = ({ icon, label, hint, value, onChange, enabled, testing, onTest }) => (
  <div className="flex flex-wrap items-center gap-3 py-3">
    <div className="flex min-w-[180px] flex-1 items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
      <div>
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        {hint && <p className="text-xs text-gray-500">{hint}</p>}
      </div>
    </div>
    <Input
      list="qz-printers"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={t('dash.printers.choose_printer')}
      className="h-9 w-full sm:w-72 text-sm"
      disabled={!enabled}
    />
    <Button variant="outline" size="sm" disabled={!enabled || !value || testing} onClick={() => onTest(value)} className="gap-1.5">
      {testing ? <Spinner className="w-4 h-4" /> : <Printer className="w-4 h-4" />}
      {t('dash.printers.test')}
    </Button>
  </div>
);

export const PrintersPage: React.FC = () => {
  const { activeBranchId, branches } = useBranchContext();
  const branch = activeBranchId !== 'all' ? activeBranchId : branches.length === 1 ? branches[0].id : '';

  const [setup, setSetup] = useState<Setup | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [host, setHost] = useState('localhost');
  const [billPrinter, setBillPrinter] = useState('');
  const [kitchenPrinters, setKitchenPrinters] = useState<Record<string, string>>({});

  const [detected, setDetected] = useState<string[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [connection, setConnection] = useState<'idle' | 'ok' | 'failed'>('idle');
  const [testing, setTesting] = useState('');

  const apply = (data: Setup) => {
    setSetup(data);
    setEnabled(!!data.qz_enabled);
    setHost(data.qz_host || 'localhost');
    setBillPrinter(data.bill_printer || '');
    setKitchenPrinters(Object.fromEntries(data.kitchens.map((k) => [k.name, k.qz_printer || ''])));
  };

  const load = useCallback(async () => {
    if (!branch) return;
    setLoadError('');
    try {
      apply(unwrap<Setup>(await call(`${API}.get_setup`, { branch })));
    } catch (err) {
      setLoadError(parseFrappeError(err, t('dash.printers.load_failed')));
    }
  }, [branch]);

  useEffect(() => {
    setSetup(null);
    void load();
  }, [load]);

  const connect = async () => {
    setConnecting(true);
    try {
      const printers = await listQzPrinters(host.trim() || 'localhost');
      setDetected(printers);
      setConnection('ok');
      showToast.success(t('dash.printers.found', { count: printers.length }));
    } catch (err) {
      setConnection('failed');
      showToast.error(t('dash.printers.connect_failed', { reason: err instanceof Error ? err.message : String(err) }));
    } finally {
      setConnecting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const data = unwrap<Setup>(
        await call(`${API}.save_setup`, {
          branch,
          qz_enabled: enabled ? 1 : 0,
          qz_host: host,
          bill_printer: billPrinter,
          kitchens: JSON.stringify(Object.entries(kitchenPrinters).map(([name, qz_printer]) => ({ name, qz_printer }))),
        }),
      );
      apply(data);
      showToast.success(t('dash.printers.saved'));
    } catch (err) {
      showToast.error(parseFrappeError(err, t('dash.printers.save_failed')));
    } finally {
      setSaving(false);
    }
  };

  // Prints straight from this browser when it is connected to QZ (instant
  // feedback while standing at the station); otherwise queues it, which also
  // proves the station's POS screen is picking jobs up.
  const testPrinter = async (printer: string) => {
    if (!printer) return;
    setTesting(printer);
    try {
      if (connection === 'ok') {
        const html = `<div style="font-family:Tahoma,Arial;direction:rtl;text-align:center;width:72mm;padding:4mm">
          <h2 style="margin:0">${t('dash.printers.test_page')}</h2><p>${printer}</p><p>${new Date().toLocaleString()}</p></div>`;
        await printWithQz(host, html, printer);
        showToast.success(t('dash.printers.test_sent', { printer }));
      } else {
        await call(`${API}.test_print`, { branch, printer });
        showToast.success(t('dash.printers.test_queued', { printer }));
        void load();
      }
    } catch (err) {
      showToast.error(parseFrappeError(err, t('dash.printers.test_failed')));
    } finally {
      setTesting('');
    }
  };

  const ensureCertificate = async () => {
    try {
      await call(`${API}.generate_certificate`, {});
      showToast.success(t('dash.printers.certificate_created'));
      void load();
    } catch (err) {
      showToast.error(parseFrappeError(err, t('dash.printers.certificate_failed')));
    }
  };

  const downloadCertificate = async () => {
    try {
      const pem = unwrap<string>(await call(`${API}.get_certificate`, {}));
      const url = URL.createObjectURL(new Blob([pem], { type: 'application/x-x509-ca-cert' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'override.crt';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast.error(parseFrappeError(err, t('dash.printers.certificate_failed')));
    }
  };

  const retry = async (job?: string) => {
    try {
      await call(`${API}.retry_failed`, { branch, job });
      showToast.success(t('dash.printers.retry_queued'));
      void load();
    } catch (err) {
      showToast.error(parseFrappeError(err, t('dash.printers.save_failed')));
    }
  };

  const options = useMemo(() => {
    const all = new Set(detected);
    if (billPrinter) all.add(billPrinter);
    Object.values(kitchenPrinters).forEach((p) => p && all.add(p));
    return [...all];
  }, [detected, billPrinter, kitchenPrinters]);

  if (!branch) {
    return <Card className="p-10 text-center text-sm text-gray-600">{t('dash.printers.choose_branch')}</Card>;
  }
  if (loadError) {
    return (
      <Card className="p-10 text-center text-sm text-red-600 space-y-3">
        <p>{loadError}</p>
        <Button variant="outline" onClick={() => void load()}>{t('common.retry')}</Button>
      </Card>
    );
  }
  if (!setup) {
    return <div className="py-24 flex justify-center"><Spinner className="w-8 h-8 text-primary" /></div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('dash.printers.title')}</h1>
          <p className="text-sm text-gray-500">{t('dash.printers.subtitle')}</p>
        </div>
        <Button onClick={() => void save()} disabled={saving} className="bg-primary text-white">
          {saving ? <Spinner className="w-4 h-4" /> : t('dash.printers.save')}
        </Button>
      </div>

      {/* 1. Station */}
      <Card className="border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-gray-900">{t('dash.printers.step_station')}</h2>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-gray-700">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4" />
            {t('dash.printers.enable_qz')}
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">{t('dash.printers.host')}</label>
            <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="localhost" dir="ltr" className="h-9" disabled={!enabled} />
            <p className="mt-1 text-xs text-gray-500">{t('dash.printers.host_hint')}</p>
          </div>
          <Button variant="outline" onClick={() => void connect()} disabled={!enabled || connecting} className="gap-1.5">
            {connecting ? <Spinner className="w-4 h-4" /> : <Plug className="w-4 h-4" />}
            {t('dash.printers.connect')}
          </Button>
        </div>
        {connection === 'ok' && (
          <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
            <CheckCircle2 className="w-4 h-4" /> {t('dash.printers.connected', { count: detected.length })}
          </p>
        )}
        {connection === 'failed' && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {t('dash.printers.not_connected_hint')}
          </p>
        )}
      </Card>

      {/* 2. Certificate */}
      <Card className="border border-gray-200 p-5 space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900">
          <ShieldCheck className="w-4 h-4 text-primary" /> {t('dash.printers.step_certificate')}
        </h2>
        {setup.certificate_ready ? (
          <>
            <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="w-4 h-4" /> {t('dash.printers.certificate_ready')}</p>
            <ol className="list-decimal space-y-1 ps-5 text-xs text-gray-600">
              <li>{t('dash.printers.cert_step_download')}</li>
              <li>{t('dash.printers.cert_step_copy')}</li>
              <li>{t('dash.printers.cert_step_restart')}</li>
            </ol>
            <Button variant="outline" size="sm" onClick={() => void downloadCertificate()} className="gap-1.5">
              <Download className="w-4 h-4" /> {t('dash.printers.download_certificate')}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-600">{t('dash.printers.certificate_missing')}</p>
            <Button size="sm" onClick={() => void ensureCertificate()} className="bg-primary text-white">
              {t('dash.printers.create_certificate')}
            </Button>
          </>
        )}
      </Card>

      {/* 3. Assignment */}
      <Card className="border border-gray-200 p-5">
        <h2 className="text-sm font-bold text-gray-900">{t('dash.printers.step_assign')}</h2>
        <p className="mb-2 text-xs text-gray-500">{t('dash.printers.assign_hint')}</p>
        <datalist id="qz-printers">
          {options.map((p) => <option key={p} value={p} />)}
        </datalist>
        <div className="divide-y divide-gray-100">
          <PrinterRow
            icon={<Receipt className="w-4 h-4" />}
            label={t('dash.printers.bill_printer')}
            hint={t('dash.printers.bill_printer_hint')}
            value={billPrinter}
            onChange={setBillPrinter}
            enabled={enabled}
            testing={!!billPrinter && testing === billPrinter}
            onTest={(p) => void testPrinter(p)}
          />
          {setup.kitchens.map((k) => (
            <PrinterRow
              key={k.name}
              icon={<ChefHat className="w-4 h-4" />}
              label={k.name}
              hint={t('dash.printers.kitchen_hint')}
              value={kitchenPrinters[k.name] || ''}
              onChange={(v) => setKitchenPrinters((prev) => ({ ...prev, [k.name]: v }))}
              enabled={enabled}
              testing={!!kitchenPrinters[k.name] && testing === kitchenPrinters[k.name]}
              onTest={(p) => void testPrinter(p)}
            />
          ))}
        </div>
        {setup.kitchens.length === 0 && <p className="py-3 text-xs text-amber-700">{t('dash.printers.no_kitchens')}</p>}
      </Card>

      {/* 4. Queue */}
      <Card className="border border-gray-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900">{t('dash.printers.queue')}</h2>
          <Button variant="ghost" size="sm" onClick={() => void load()} aria-label={t('common.refresh')}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="rounded-lg bg-gray-100 px-3 py-1.5">{t('dash.printers.pending', { count: setup.queue.pending })}</span>
          <span className={`rounded-lg px-3 py-1.5 ${setup.queue.failed ? 'bg-red-50 text-red-700' : 'bg-gray-100'}`}>
            {t('dash.printers.failed', { count: setup.queue.failed })}
          </span>
        </div>
        {setup.queue.pending > 0 && <p className="text-xs text-gray-500">{t('dash.printers.pending_hint')}</p>}
        {setup.failed_jobs.length > 0 && (
          <>
            <ul className="divide-y divide-gray-100 text-xs">
              {setup.failed_jobs.map((job) => (
                <li key={job.name} className="flex items-start justify-between gap-3 py-2">
                  <span className="flex items-start gap-2">
                    <XCircle className="mt-0.5 w-3.5 h-3.5 shrink-0 text-red-500" />
                    <span>
                      <b>{job.reference_name}</b> → {job.printer}
                      {job.error && <span className="block text-gray-500">{job.error}</span>}
                    </span>
                  </span>
                  <Button variant="outline" size="sm" className="h-7" onClick={() => void retry(job.name)}>{t('dash.printers.retry')}</Button>
                </li>
              ))}
            </ul>
            <Button variant="outline" size="sm" onClick={() => void retry()}>{t('dash.printers.retry_all')}</Button>
          </>
        )}
      </Card>
    </div>
  );
};

export default PrintersPage;
