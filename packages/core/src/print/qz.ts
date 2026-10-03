import qz from 'qz-tray';
import { call } from '../frappe/client';

/**
 * QZ Tray printing.
 *
 * Signing happens on the server: the certificate comes from
 * `qz_printing.get_certificate` and every payload is signed by
 * `ury_print.signature_promise`, so the private key never reaches a browser.
 * (This used to sign in the browser with a key injected by the app — which
 * the POS passed as an empty string, so QZ treated the site as untrusted and
 * asked "Allow?" on every print.)
 */

let securityReady = false;

function unwrap<T>(res: unknown): T {
  return ((res as { message?: T })?.message ?? res) as T;
}

function setupSecurity(): void {
  if (securityReady) return;
  qz.security.setCertificatePromise((resolve: (cert: string) => void, reject: (err?: string) => void) => {
    call('ury.ury.api.qz_printing.get_certificate', {})
      .then((res: unknown) => {
        const cert = unwrap<string>(res);
        // An empty certificate makes QZ fall back to its "untrusted" prompt
        // rather than failing outright — still prints, just not silently.
        resolve(cert || '');
      })
      .catch((err: unknown) => reject('Could not load the QZ certificate: ' + String(err)));
  });
  qz.security.setSignatureAlgorithm('SHA512');
  qz.security.setSignaturePromise((toSign: string) => (resolve: (sig: string) => void, reject: (err?: string) => void) => {
    call('ury.ury.api.ury_print.signature_promise', { toSign })
      .then((res: unknown) => resolve(unwrap<string>(res)))
      .catch((err: unknown) => reject('QZ signing failed: ' + String(err)));
  });
  securityReady = true;
}

/** Kept for compatibility: signing is server-side now, there is no key to inject. */
export function initPrinting(_opts?: { signKey?: string }): void {
  setupSecurity();
}

export async function loadQzPrinter(host: string): Promise<void> {
  setupSecurity();
  if (!qz.websocket.isActive()) {
    await qz.websocket.connect({ host: host || 'localhost', usingSecure: false, retries: 1, delay: 1 });
  }
}

export function disconnectQzPrinter(): void {
  if (qz.websocket.isActive()) qz.websocket.disconnect();
}

export function isQzConnected(): boolean {
  return qz.websocket.isActive();
}

/** Every printer installed on the QZ station, as QZ names them. */
export async function listQzPrinters(host: string): Promise<string[]> {
  await loadQzPrinter(host);
  const found = await qz.printers.find();
  return (Array.isArray(found) ? found : [found]).filter(Boolean) as string[];
}

/**
 * Print HTML through QZ. With no `printer` the station's default printer is
 * used; with one, that exact printer — which is how one station feeds a bill
 * printer and several kitchen printers.
 */
export async function printWithQz(host: string, htmlToPrint: string, printer?: string | null): Promise<void> {
  await loadQzPrinter(host);
  const target = printer || (await qz.printers.getDefault());
  const config = qz.configs.create(target, { scaleContent: true, rasterize: true });
  const data = [{ type: 'pixel', format: 'html', flavor: 'plain', data: htmlToPrint }];
  await qz.print(config, data as never);
}
