import qz from 'qz-tray';
import axios from 'axios';
import { call } from '../frappe/client';

/**
 * @deprecated Signing now happens server-side (see `ury.ury.api.ury_print.qz_sign`);
 * there is nothing to initialize. Kept as a no-op for backwards compatibility.
 */
export function initPrinting(_opts?: unknown): void {
  // no-op
}

async function signOnServer(toSign: string): Promise<string> {
  const res = await call.post('ury.ury.api.ury_print.qz_sign', { toSign });
  return res.message as string;
}

export async function loadQzPrinter(host: string): Promise<void> {
  qz.security.setCertificatePromise((resolve: (data: string) => void, reject: (err?: string) => void) => {
    axios.get('/assets/ury/files/cert.pem')
      .then(({ data }) => resolve(data))
      .catch((err) => reject('Error fetching certificate: ' + String(err)));
  });
  if (!qz.websocket.isActive()) {
    await qz.websocket.connect({ host, usingSecure: false });
  }
}

export function disconnectQzPrinter(): void {
  if (qz.websocket.isActive()) qz.websocket.disconnect();
}

export async function printWithQz(host: string, htmlToPrint: string): Promise<void> {
  qz.security.setSignatureAlgorithm('SHA512');
  qz.security.setSignaturePromise((toSign: string) => (resolve: (sig: string) => void, reject: (err?: string) => void) => {
    signOnServer(toSign)
      .then((signature) => resolve(signature))
      .catch((err) => reject('Error signing print request: ' + String(err)));
  });

  const printing = async () => {
    const printer = await qz.printers.getDefault();
    const data = [{ type: 'html', format: 'plain', data: htmlToPrint }];
    const config = qz.configs.create(printer);
    await qz.print(config, data as any);
  };

  if (qz.websocket.isActive()) {
    await printing();
  } else {
    await loadQzPrinter(host);
    await printing();
  }
}
