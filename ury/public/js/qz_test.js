console.log("🖨️ QZ Test Script Loaded");

// Wait for page to fully load
frappe.ready(function() {
    console.log("Frappe ready, testing QZ Tray in 2 seconds...");
    
    setTimeout(async function() {
        try {
            // Check if QZ is loaded
            if (typeof qz === 'undefined') {
                console.error("❌ QZ Tray library not found!");
                return;
            }
            console.log("✓ QZ Tray library loaded");
            
            // Get certificates
            console.log("Fetching certificates from server...");
            const certResponse = await frappe.call({
                method: 'ury.ury.page.ury_print.qz_certificate'
            });
            
            const keyResponse = await frappe.call({
                method: 'ury.ury.page.ury_print.signature_promise'
            });
            
            console.log("✓ Certificates fetched");
            console.log("  Cert length:", certResponse.message ? certResponse.message.length : 0);
            console.log("  Key length:", keyResponse.message ? keyResponse.message.length : 0);
            
            // Set up security
            qz.security.setCertificatePromise(function(resolve, reject) {
                resolve(certResponse.message);
            });
            
            qz.security.setSignaturePromise(function(toSign) {
                return function(resolve, reject) {
                    // For testing, we'll skip actual signing
                    resolve();
                };
            });
            
            // Try to connect
            console.log("Attempting to connect to QZ Tray...");
            await qz.websocket.connect();
            console.log("✅ QZ Tray connected successfully!");
            
            // List printers
            const printers = await qz.printers.find();
            console.log("✅ Available printers:", printers);
            
            frappe.show_alert({
                message: 'QZ Tray Connected! Found ' + printers.length + ' printer(s)',
                indicator: 'green'
            }, 5);
            
        } catch (error) {
            console.error("❌ Error:", error);
            frappe.msgprint({
                title: 'QZ Tray Error',
                message: error.toString(),
                indicator: 'red'
            });
        }
    }, 2000);
});
