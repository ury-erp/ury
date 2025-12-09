import qz from './qz-init';
import axios from 'axios';

export async function loadQzPrinter(host: string): Promise<void> {
  qz.security.setCertificatePromise((resolve: (data: string) => void, reject: (err?: string) => void) => {
    axios.get('/assets/ury/pos/assets/ury/files/cert.pem')
      .then(({ data }) => resolve(data))
      .catch((err) => reject('Error fetching certificate: ' + String(err)));
  });
  
  // Bypass signature - return empty string
  qz.security.setSignaturePromise((toSign: string) => {
    return (resolve: (sig: string) => void) => {
      console.log('⚠️ Signature bypassed for testing');
      resolve('');
    };
  });
  
  if (!qz.websocket.isActive()) {
    await qz.websocket.connect({ host, usingSecure: false });
  }
}

export function disconnectQzPrinter(): void {
  if (qz.websocket.isActive()) qz.websocket.disconnect();
}

export async function printWithQz(host: string, htmlToPrint: string): Promise<void> {
  const printing = async () => {
    const printer = await qz.printers.getDefault();
    console.log('🖨️ Selected printer:', printer);
    
    const data = [{ type: 'html', format: 'plain', data: htmlToPrint }];
    const config = qz.configs.create(printer);
    
    console.log('📄 Sending to printer...');
    await qz.print(config, data as any);
    console.log('✅ Print job sent successfully');
  };

  if (qz.websocket.isActive()) {
    await printing();
  } else {
    await loadQzPrinter(host);
    await printing();
  }
}

export async function printKotWithQz(printerName: string, htmlToPrint: string): Promise<void> {
  const host = 'localhost';
  
  const printing = async () => {
    console.log(`🖨️ Printing to specific printer: ${printerName}`);
    
    const data = [{ type: 'html', format: 'plain', data: htmlToPrint }];
    const config = qz.configs.create(printerName);
    
    console.log('📄 Sending KOT to printer...');
    await qz.print(config, data as any);
    console.log('✅ KOT print job sent successfully');
  };

  if (qz.websocket.isActive()) {
    await printing();
  } else {
    await loadQzPrinter(host);
    await printing();
  }
}
