import qz from 'qz-tray';
import axios from 'axios';
import { KEYUTIL, KJUR, stob64, hextorstr } from 'jsrsasign';

// SECURITY NOTE: The private key should be loaded from a secure runtime source,
// not bundled into the client JS. This is a build-time import that exposes
// the key in the browser bundle. For production, consider:
// 1. Loading the key from an authenticated API endpoint
// 2. Using environment variables with server-side signing
// 3. Moving signing to a backend service
let privateKey: string | undefined;

async function loadPrivateKey(): Promise<void> {
  if (privateKey !== undefined) return;
  try {
    const keyModule = await import('../../privateKey');
    privateKey = keyModule?.privateKey || keyModule?.default;
  } catch {
    privateKey = undefined;
  }
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
  qz.security.setSignaturePromise((toSign: string) => async (resolve: (sig: string) => void, reject: (err?: string) => void) => {
    try {
      await loadPrivateKey();
      if (!privateKey) {
        reject('Private key not configured. See print-qz.ts SECURITY NOTE.');
        return;
      }
      const pk = KEYUTIL.getKey(privateKey);
      const sig = new KJUR.crypto.Signature({ alg: 'SHA512withRSA' });
      sig.init(pk);
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