/*
 * QZ Tray signing — server-side sign-only model.
 *
 * The QZ private key never leaves the server. For every payload QZ Tray
 * needs signed, this script asks the whitelisted `signature_promise`
 * endpoint to sign it server-side and returns the base64 signature.
 *
 * Access to the endpoint is restricted to authenticated users holding a
 * POS role (see QZ_SIGNING_ROLES in ury/ury/api/ury_print.py).
 *
 * Depends:
 *     - qz-tray.js
 *
 * Steps:
 *     1. Include this script into your web page
 *        <script src="path/to/sign-message.js"></script>
 *
 *     2. Remove or comment out any other references to "setSignaturePromise"
 */


// Set the signature algorithm and function
qz.security.setSignatureAlgorithm("SHA512"); // Since 2.1

qz.security.setSignaturePromise(function (toSign) {
    return function (resolve, reject) {
        frappe.call({
            method: 'ury.ury.api.ury_print.signature_promise',
            args: { toSign: toSign },
            callback: function (response) {
                if (response.message) {
                    resolve(response.message);
                } else {
                    reject("No signature returned by the server");
                }
            },
            error: function (err) {
                console.error("QZ signing request failed:", err);
                reject(err);
            },
        });
    };
});
