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


// Include the necessary libraries
var qzPrivateKey = null; // Initialize the variable to hold the private key

// Load the private key path from the site config.json using Frappe API
frappe.call({
    method: 'ury.ury.api.ury_print.signature_promise',
    callback: function (response) {
        if (response.message) {
            var privateKeyPath = response.message;
            // Load the private key from the specified path asynchronously
            fetch("/private/" + privateKeyPath)
                .then(response => response.text())
                .then(privateKey => {
                    qzPrivateKey = privateKey; // Store the private key in the variable

                    // Set the signature algorithm and function
                    qz.security.setSignatureAlgorithm("SHA512"); // Since 2.1
                    qz.security.setSignaturePromise(function (toSign) {
                        return function (resolve, reject) {
                            try {
                                var pk = KEYUTIL.getKey(qzPrivateKey);
                                var sig = new KJUR.crypto.Signature({ "alg": "SHA512withRSA" });  // Use "SHA1withRSA" for QZ Tray 2.0 and older
                                sig.init(pk);
                                sig.updateString(toSign);
                                var hex = sig.sign();
                                resolve(stob64(hextorstr(hex)));
                            } catch (err) {
                                console.error(err);
                                reject(err);
                            }
                        };
                    });

                    // Continue with the rest of your code
                })
                .catch(error => {
                    console.error("Failed to load the private key:", error);
                });
        }
    }
});
