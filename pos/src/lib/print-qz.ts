import qz from 'qz-tray';
import { KEYUTIL, KJUR, stob64, hextorstr } from 'jsrsasign';
import { call } from './frappe-sdk';

// SECURITY: Private key is fetched at runtime from the authenticated backend API
// (ury.ury.api.ury_print.signature_promise). This ensures the key is never bundled
// into the client JS and is only available to authenticated users.
let privateKey: string | undefined;
let certLoaded = false;

async function loadPrivateKey(): Promise<string> {
  if (privateKey !== undefined) return privateKey;
  try {
    const response = await call.get('ury.ury.api.ury_print.signature_promise');
    privateKey = response.message;
    if (!privateKey) {
      throw new Error('Private key not configured in site_config (qz_private_key)');
    }
    return privateKey;
  } catch (err) {
    throw new Error(`Failed to load QZ signing key from server: ${err}`);
  }
}

export async function loadQzPrinter(host: string): Promise<void> {
  if (!certLoaded) {
    const cert = await call.get('ury.ury.api.ury_print.qz_certificate');
    const certPem = cert.message;
    if (!certPem) {
      throw new Error('QZ certificate not configured in site_config (qz_cert)');
    }
    qz.security.setCertificatePromise(
      (resolve: (data: string) => void, reject: (err?: string) => void) => {
        resolve(certPem);
      }
    );
    certLoaded = true;
  }

  if (!qz.websocket.isActive()) {
    await qz.websocket.connect({ host, usingSecure: false });
  }
}

export function disconnectQzPrinter(): void {
  if (qz.websocket.isActive()) qz.websocket.disconnect();
}

export async function printWithQz(host: string, htmlToPrint: string): Promise<void> {
  qz.security.setSignatureAlgorithm('SHA512');
  qz.security.setSignaturePromise((toSign: string) => async (resolve: (sig: string) => void, reject: (err?: string) => void) => {
    try {
      const pk = await loadPrivateKey();
      const key = KEYUTIL.getKey(pk);
      const sig = new KJUR.crypto.Signature({ alg: 'SHA512withRSA' });
      sig.init(key);
      sig.updateString(toSign);
      const hex = sig.sign();
      resolve(stob64(hextorstr(hex)));
    } catch (err) {
      reject(String(err));
    }
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