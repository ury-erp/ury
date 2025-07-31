import axios from "axios";
import qz from "qz-tray";  
import { privateKey } from "../../../privateKey";

import {
    KEYUTIL,
    KJUR,
    stob64,
    hextorstr,
} from 'jsrsasign';

export function loadQzPrinter(host){
    return new Promise((resolve,reject)=>{
        qz.security.setCertificatePromise((resolve)=>{
            axios.get("/assets/ury/files/cert.pem")
            .then((response)=>{
                resolve(response.data)  
            }).catch((err)=>{
                reject({
                    custom:true,
                    title:"Error during fetching certificate",
                    message:err
                });
            })
        });
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
        }
    });
}

export function disconnectQzPrinter(){
    if(qz.websocket.isActive())
        qz.websocket.disconnect();
}

export function printWithQz(host,htmlToPrint){
    
    return new Promise((resolve,reject)=>{
        qz.security.setSignatureAlgorithm("SHA512"); // Since 2.1
        qz.security.setSignaturePromise(function(toSign) {
            return function(resolve) {
                try {
                    var pk = KEYUTIL.getKey(privateKey);
                    var sig = new KJUR.crypto.Signature({"alg": "SHA512withRSA"});  // Use "SHA1withRSA" for QZ Tray 2.0 and older
                    sig.init(pk); 
                    sig.updateString(toSign);
                    var hex = sig.sign();
                    resolve(stob64(hextorstr(hex)));
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