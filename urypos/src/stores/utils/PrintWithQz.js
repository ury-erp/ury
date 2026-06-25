import qz from "qz-tray";
import {
    KEYUTIL,
    KJUR,
    stob64,
    hextorstr,
} from 'jsrsasign';
import { frappe } from '../frappeSdk';

const call = frappe.call();
let loadedKey = null;

async function fetchPrivateKey() {
    if (loadedKey) return loadedKey;
    const response = await call.get('ury.ury.api.ury_print.signature_promise');
    loadedKey = response.message;
    if (!loadedKey) {
        throw new Error('Private key not configured in site_config (qz_private_key)');
    }
    return loadedKey;
}

export function loadQzPrinter(host){
    return new Promise((resolve,reject)=>{
        call.get('ury.ury.api.ury_print.qz_certificate')
            .then((response) => {
                const cert = response.message;
                if (!cert) {
                    reject({ custom: true, title: 'Certificate not configured', message: 'qz_cert missing in site_config' });
                    return;
                }
                qz.security.setCertificatePromise((res) => res(cert));

                if(!qz.websocket.isActive()){
                    qz.websocket.connect({
                        host,
                        usingSecure:false
                    })
                    .then(()=>resolve("success"))
                    .catch((err)=>{
                        reject({
                            custom:true,
                            title:"Error during connection to printer",
                            message:String(err)
                        });
                    })
                } else {
                    resolve("success");
                }
            })
            .catch((err) => {
                reject({
                    custom: true,
                    title: "Error fetching certificate",
                    message: String(err)
                });
            });
    });
}

export function disconnectQzPrinter(){
    if(qz.websocket.isActive())
        qz.websocket.disconnect();
}

export function printWithQz(host, htmlToPrint){
    return new Promise((resolve,reject)=>{
        qz.security.setSignatureAlgorithm("SHA512");
        qz.security.setSignaturePromise(function(toSign) {
            return async function(res) {
                try {
                    const pk = await fetchPrivateKey();
                    var key = KEYUTIL.getKey(pk);
                    var sig = new KJUR.crypto.Signature({"alg": "SHA512withRSA"});
                    sig.init(key);
                    sig.updateString(toSign);
                    var hex = sig.sign();
                    res(stob64(hextorstr(hex)));
                } catch (err) {
                    reject(err);
                }
            };
        });

        const printing=()=>{
            qz.printers.getDefault()
                .then(async (printer)=>{
                    const data=[{
                        type:"html",
                        format:"plain",
                        data:htmlToPrint
                    }];
                    const config=qz.configs.create(printer)
                    try {
                        await qz.print(config, data);
                        return resolve("printed");
                    } catch (e) {
                        qz.websocket.disconnect();
                        reject(
                            {
                                custom: true,
                                title: "Print failed",
                                message: String(e)
                            }
                        );
                    }
                })
                .catch((err)=>{
                    qz.websocket.disconnect();
                    reject({
                        custom:true,
                        title:"Error looking up for printer",
                        message:String(err)
                    })
            })
        }
        
        if(qz.websocket.isActive()){
            printing();
        }
        else{
            loadQzPrinter(host).then(()=>printing())
            .catch((err)=>reject(err))
        }
    })
}