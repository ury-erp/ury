/*
 * JavaScript client-side example using jsrsasign
 */

// #########################################################
// #             WARNING   WARNING   WARNING               #
// #########################################################
// #                                                       #
// # This file is intended for demonstration purposes      #
// # only.                                                 #
// #                                                       #
// # It is the SOLE responsibility of YOU, the programmer  #
// # to prevent against unauthorized access to any signing #
// # functions.                                            #
// #                                                       #
// # Organizations that do not protect against un-         #
// # authorized signing will be black-listed to prevent    #
// # software piracy.                                      #
// #                                                       #
// # -QZ Industries, LLC                                   #
// #                                                       #
// #########################################################

/**
 * Depends:
 *     - jsrsasign-latest-all-min.js
 *     - qz-tray.js
 *
 * Steps:
 *
 *     1. Include jsrsasign 8.0.4 into your web page
 *        <script src="https://cdn.rawgit.com/kjur/jsrsasign/c057d3447b194fa0a3fdcea110579454898e093d/jsrsasign-all-min.js"></script>
 *
 *     2. Update the privateKey below with contents from private-key.pem
 *
 *     3. Include this script into your web page
 *        <script src="path/to/sign-message.js"></script>
 *
 *     4. Remove or comment out any other references to "setSignaturePromise"
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
                    reject("Signing failed");
                }
            },
            error: function (err) {
                console.error("Error signing message:", err);
                reject(err);
            }
        });
    };
});
