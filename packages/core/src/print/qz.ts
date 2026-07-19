import qz from 'qz-tray';
import axios from 'axios';
import { KEYUTIL, KJUR, stob64, hextorstr } from 'jsrsasign';

let injectedSignKey: string | null = null;

export function initPrinting(opts: { signKey: string }) {
  injectedSignKey = opts.signKey;
}

function ensureSignKey(): string {
  if (!injectedSignKey) {
    throw new Error(
      'QZ printing has not been initialized. Call initPrinting({ signKey: ... }) before using printWithQz.'
    );
  }
  return injectedSignKey;
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
  const signKey = ensureSignKey();

  qz.security.setSignatureAlgorithm('SHA512');
  qz.security.setSignaturePromise((toSign: string) => (resolve: (sig: string) => void, reject: (err?: string) => void) => {
    try {
      const pk = KEYUTIL.getKey(signKey);
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
