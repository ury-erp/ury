console.log("🖨️ POS Page JS Loaded");

// Load QZ Tray library first
function loadQZTray() {
    return new Promise((resolve, reject) => {
        // Check if already loaded
        if (typeof qz !== 'undefined') {
            console.log("✓ QZ Tray already loaded");
            resolve();
            return;
        }

        // Load the script
        const script = document.createElement('script');
        script.src = '/assets/ury/js/qz-tray.js';
        script.onload = () => {
            console.log("✓ QZ Tray library loaded");
            resolve();
        };
        script.onerror = () => {
            console.error("❌ Failed to load QZ Tray library");
            reject(new Error("Failed to load QZ Tray"));
        };
        document.head.appendChild(script);
    });
}

// Initialize QZ Tray
async function initQZTray() {
    console.log("🔧 Initializing QZ Tray...");
    
    try {
        // Load library first
        await loadQZTray();
        
        // Get certificates from server
        console.log("📜 Fetching certificates from server...");
        const certResponse = await frappe.call({
            method: 'ury.ury.page.ury_print.qz_certificate'
        });
        
        const keyResponse = await frappe.call({
            method: 'ury.ury.page.ury_print.signature_promise'
        });
        
        if (!certResponse.message || !keyResponse.message) {
            console.error("❌ Certificates not found in server");
            frappe.msgprint({
                title: 'QZ Configuration Error',
                message: 'QZ certificates not found. Please contact administrator.',
                indicator: 'red'
            });
            return false;
        }
        
        console.log("✓ Certificates fetched");
        console.log("  Cert length:", certResponse.message.length);
        console.log("  Key length:", keyResponse.message.length);
        
        // Set up QZ security
        qz.security.setCertificatePromise(function(resolve, reject) {
            resolve(certResponse.message);
        });
        
        qz.security.setSignaturePromise(function(toSign) {
            return function(resolve, reject) {
                // For now, we'll skip signing
                // In production, you'd sign the data here
                resolve();
            };
        });
        
        // Connect to QZ Tray
        if (qz.websocket.isActive()) {
            console.log("✓ QZ Tray already connected");
        } else {
            console.log("🔌 Connecting to QZ Tray...");
            await qz.websocket.connect();
            console.log("✅ QZ Tray connected successfully!");
        }
        
        // Get available printers
        const printers = await qz.printers.find();
        console.log("✅ Found printers:", printers);
        
        // Show success message
        frappe.show_alert({
            message: '✅ QZ Tray Connected! Found ' + printers.length + ' printer(s)',
            indicator: 'green'
        }, 5);
        
        return true;
        
    } catch (error) {
        console.error("❌ QZ Tray Error:", error);
        frappe.msgprint({
            title: 'QZ Tray Connection Failed',
            message: 'Could not connect to QZ Tray. Make sure it is running.<br><br>Error: ' + error.message,
            indicator: 'red'
        });
        return false;
    }
}

// Auto-initialize when page loads
frappe.ready(function() {
    console.log("📄 Frappe ready on POS page");
    
    // Wait a bit for page to fully load
    setTimeout(function() {
        initQZTray();
    }, 1000);
});

// Make functions globally available for manual testing
window.qz_init = initQZTray;
window.qz_test = async function() {
    console.log("Running manual QZ test...");
    await initQZTray();
    
    if (qz.websocket.isActive()) {
        const printers = await qz.printers.find();
        console.log("Test successful! Printers:", printers);
        return printers;
    }
};
