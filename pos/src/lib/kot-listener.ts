import { printKotWithQz } from './print-qz';

let pollingInterval: NodeJS.Timeout | null = null;
let lastCheckedKot: string | null = null;

export function setupKotListener() {
  if (typeof window === 'undefined') return;

  console.log('✅ KOT polling listener initialized');

  // Poll every 3 seconds for new KOTs
  pollingInterval = setInterval(async () => {
    try {
      await checkForNewKots();
    } catch (error) {
      console.error('Error checking for KOTs:', error);
    }
  }, 3000);
}

async function checkForNewKots() {
  try {
    // Get the latest KOT
    const response = await fetch('/api/method/ury.ury_pos.api.get_latest_kot');
    const result = await response.json();
    
    if (!result?.message) return;
    
    const { kot_name, pos_profile, printers, kot_printed } = result.message;
    
    // Skip if already printed or if we've already processed this KOT
    if (kot_printed || kot_name === lastCheckedKot) return;
    
    console.log('🔔 New KOT detected:', kot_name);
    lastCheckedKot = kot_name;
    
    if (!printers || printers.length === 0) {
      console.error('No printers configured for KOT');
      return;
    }

    // Print to each configured printer
    for (const printerSetting of printers) {
      const printerName = printerSetting.printer;
      const printFormat = printerSetting.custom_kot_print_format || 'KOT Print';
      
      try {
        console.log(`🖨️ Printing KOT ${kot_name} to ${printerName}`);
        
        // Fetch KOT HTML
        const html = await getKotPrintHtml(kot_name, printFormat);
        
        // Print with QZ to specific printer
        await printKotWithQz(printerName, html);
        
        console.log(`✅ KOT printed to ${printerName}`);
        
        // Mark as printed
        await markKotAsPrinted(kot_name);
      } catch (error) {
        console.error(`❌ Failed to print KOT to ${printerName}:`, error);
      }
    }
  } catch (error) {
    // Silently fail if no KOTs found
  }
}

async function getKotPrintHtml(kotName: string, printFormat: string): Promise<string> {
  const params = new URLSearchParams({
    doc: 'URY KOT',
    name: kotName,
    print_format: printFormat,
    _lang: 'en',
    no_letterhead: '1',
    letterhead: 'No Letterhead',
    settings: '{}'
  });

  const response = await fetch(`/api/method/frappe.www.printview.get_html_and_style?${params}`);
  const result = await response.json();
  
  if (!result?.message?.html) {
    throw new Error('Failed to fetch KOT HTML');
  }

  return `
    <html>
      <head>
        <style>${result.message.style || ''}</style>
      </head>
      <body>${result.message.html}</body>
    </html>
  `;
}

async function markKotAsPrinted(kotName: string): Promise<void> {
  try {
    // Use GET request which doesn't require CSRF
    const response = await fetch(`/api/method/ury.ury_pos.api.mark_kot_printed?kot_name=${encodeURIComponent(kotName)}`);

    if (!response.ok) {
      console.error('Failed to mark KOT as printed:', response.status);
    } else {
      console.log('✅ KOT marked as printed in database');
    }
  } catch (error) {
    console.error('Error marking KOT as printed:', error);
  }
}

export function stopKotListener() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log('🛑 KOT polling listener stopped');
  }
}