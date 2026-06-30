import { defineStore } from "pinia";
import router from "../router";
import { useTableStore } from "./Table.js";
import { useMenuStore } from "./Menu.js";
import { useCustomerStore } from "./Customer.js";
import { useNotifications } from "./Notification.js";
import { usetoggleRecentOrder } from "./recentOrder.js";
import { useAlert } from "./Alert.js";
import { useNotificationModal } from './NotificationModal';
import { useAuthStore } from "./Auth.js";
import frappe from "./frappeSdk.js";

import {
  printWithQz,
  loadQzPrinter,
  disconnectQzPrinter,
} from "./utils/PrintWithQz";

export const useInvoiceDataStore = defineStore("invoiceData", {
  state: () => ({
    waiter: "",
    cashier: "",
    warehouse: "",
    posProfile: "",
    enableKotReprint:0,
    defaultModeOfPayment: "Cash",
    owner:null,
    branch: null,
    printer: null,
    qz_host: null,
    company: null,
    currency: null,
    qz_print: null,
    paidLimit: null,
    print_type: null,
    grandTotal: null,
    modifiedTime: null,
    print_format: null,
    cancelReason: null,
    invoiceNumber: null,
    multipleCashier:null,
    tableInvoiceNo: null,
    tableAttention: null,
    modeOfPaymentList: null,
    disableRoundedTotal: null,
    showUpdateButtton: true,
    isChecked: false,
    isPrinting: false,
    showDialog: false,
    kotPrinting: false,
    editOrderType:false,
    enableDiscount: false,
    invoiceUpdating: false,
    cancelInvoiceFlag: false,
    invoiceDetails: [],
    previousOrderItem: [],
    db: frappe.db(),
    call: frappe.call(),
    alert: useAlert(),
    auth: useAuthStore(),
    menu: useMenuStore(),
    table: useTableStore(),
    customers: useCustomerStore(),
    notification: useNotifications(),
    recentOrders: usetoggleRecentOrder(),
    notificationModal: useNotificationModal(),
  }),
  actions: {
    async fetchInvoiceDetails() {
      try {
        await this.call.get("ury.ury_pos.api.getPosProfile").then((result) => {
          this.invoiceDetails = result.message;
          this.tableAttention = this.invoiceDetails.tableAttention;
          this.warehouse = this.invoiceDetails.warehouse;
          this.posProfile = this.invoiceDetails.pos_profile;
          this.waiter = this.invoiceDetails.waiter;
          this.cashier = this.invoiceDetails.cashier;
          this.owner = this.invoiceDetails.owner
          this.branch = this.invoiceDetails.branch;
          this.company = this.invoiceDetails.company;
          this.print_format = this.invoiceDetails.print_format;
          this.qz_print = this.invoiceDetails.qz_print;
          this.qz_host = this.invoiceDetails.qz_host;
          this.print_type = this.invoiceDetails.print_type;
          this.printer = this.invoiceDetails.printer;
          this.paidLimit = this.invoiceDetails.paid_limit;
          this.disableRoundedTotal = this.invoiceDetails.disable_rounded_total;
          this.enableDiscount = this.invoiceDetails.enable_discount;
          this.enableKotReprint=this.invoiceDetails.enable_kot_reprint;
          this.multipleCashier=this.invoiceDetails.multiple_cashier
          this.editOrderType=this.invoiceDetails.edit_order_type
          if (this.qz_host) {
            loadQzPrinter(this.qz_host);
          }
          this.db
            .getDoc("Company", this.company)
            .then((doc) => {
              this.db
                .getDoc("Currency", doc.default_currency)
                .then((currency) => {
                  this.currency = currency.symbol;
                })
                .catch((error) => {
                  if (error._server_messages) {
                    this.alert.createAlert(
                      "Message",
                      "You do not have Read or Select Permissions for Currency",
                      "OK"
                    );
                  }
                });
            })
            .catch((error) => {
              if (error._server_messages) {
                this.alert.createAlert(
                  "Message",
                  "You do not have Read or Select Permissions for Company",
                  "OK"
                );
              }
            });
        });
      } catch (error) {
        if (error._server_messages) {
          const messages = JSON.parse(error._server_messages);
          const message = JSON.parse(messages[0]);
          this.alert.createAlert("Message", message.message, "OK");
        }
      }
      this.call
        .get("ury.ury_pos.api.getModeOfPayment")
        .then((result) => {
          this.modeOfPaymentList = result.message;
        })
        .catch((error) => {
          // console.error(error)
        });
    },

    // Method for creating an invoice
    async invoiceCreation() {
      this.showUpdateButtton = false;
      this.invoiceUpdating = true;
      let selectedTables = "";
      let cart = this.menu.cart;
      const customerName = this.customers.search;
      const ordeType =
        this.menu.selectedOrderType || this.recentOrders.pastOrderType;
      const numberOfPax = this.customers.numberOfPax;
      let invoice =
        this.recentOrders.draftInvoice ||
        this.table.invoiceNo ||
        this.invoiceNumber ||
        null;
      let lastInvoice =
        this.invoiceNumber ||
        this.recentOrders.draftInvoice ||
        this.table.invoiceNo ||
        null;
      let cashier= this.table.cashier ||
        this.cashier ||
        this.cashier;

      selectedTables =
        this.table.selectedTable || this.recentOrders.restaurantTable;
      const cartCopy = JSON.parse(JSON.stringify(cart));
      let waiter = null
      if (lastInvoice) {
        waiter = this.table.previousWaiter !== null &&
          this.table.previousWaiter !== undefined
          ? this.table.previousWaiter
          : this.recentOrders.recentWaiter !== null &&
            this.recentOrders.recentWaiter !== undefined
            ? this.recentOrders.recentWaiter
            : this.waiter;
      } else {
        waiter = this.waiter;
      }
      if (this.recentOrders.modifiedTime){
        this.modifiedTime =this.recentOrders.modifiedTime
      }
      else{
        this.modifiedTime =this.table.modifiedTime
      }

      // Check for modifications in existing invoice
      if (invoice) {
        let pastOrderdItem = [];
        if (this.table.previousOrderdItem?.length) {
          pastOrderdItem = this.table.previousOrderdItem;
        } else if (this.recentOrders.pastOrderdItem?.length) {
          pastOrderdItem = this.recentOrders.pastOrderdItem;
        }
        
        const originalItems = {};
        pastOrderdItem.forEach(item => {
          originalItems[item.item_code] = {
            qty: item.qty,
            name: item.item_name
          };
        });
        
        const currentItems = {};
        this.menu.cart.forEach(item => {
          currentItems[item.item] = {
            qty: item.qty,
            name: item.item_name
          };
        });
        
        const removedItems = Object.keys(originalItems).filter(
          itemCode => !currentItems[itemCode]
        );
    
        const reducedQtyItems = [];
        Object.entries(originalItems).forEach(([itemCode, itemData]) => {
          if (currentItems[itemCode] && currentItems[itemCode].qty < itemData.qty) {
            reducedQtyItems.push(
              `${itemData.name} (qty reduced from ${itemData.qty} to ${currentItems[itemCode].qty})`
            );
          }
        });
    
        if (removedItems.length > 0 || reducedQtyItems.length > 0) {
          this.invoiceUpdating = false;
                
          let errorMsg = [];
          if (removedItems.length > 0) {
            const removedItemNames = removedItems.map(
              itemCode => originalItems[itemCode].name
            );
            errorMsg.push(`Removed items: ${removedItemNames.join(', ')}\n`);
          }
          if (reducedQtyItems.length > 0) {
            errorMsg.push(`Modified quantities: ${reducedQtyItems.join(',\n')}`);
          }
    
          // Show confirmation modal and wait for user response
          await new Promise((resolve, reject) => {
            this.notificationModal.showModal({
              title: "Are You Sure to remove these items?",
              message: errorMsg.join('\n'),
              actionText: "Yes",
              showCancelButton: true,
              onConfirm: () => {
                this.invoiceUpdating = true;
                this.showUpdateButtton = true;
                resolve();
              },
              onCancel: () => {
                this.showUpdateButtton = true;
                this.invoiceUpdating = false;
                reject('User cancelled the operation');
              }
            });
          });
        }
      }
    
      // Only proceed with API call if no rejection occurred
      const creatingInvoice = {
        table: selectedTables,
        customer: customerName,
        items: cart,
        no_of_pax: numberOfPax,
        mode_of_payment: this.defaultModeOfPayment,
        cashier: cashier,
        owner:this.owner,
        waiter: waiter,
        last_modified_time: this.modifiedTime,
        pos_profile: this.posProfile,
        invoice: invoice,
        aggregator_id: this.menu.aggregatorId,
        order_type: ordeType,
        last_invoice: lastInvoice,
        comments: this.menu.comments,
        room: this.table.selectedRoom,
      };
      if (!this.auth.cashier && !numberOfPax && this.table.takeAwayTable == 0) {
        this.alert.createAlert(
          "Message",
          "Please Select Customer / No of Pax",
          "OK"
        );
        this.showUpdateButtton = true;
        this.invoiceUpdating = false;
        return;
      }
    
      if (!this.auth.cashier && !selectedTables) {
        this.alert.createAlert("Message", "Please Select a Table", "OK");
        this.showUpdateButtton = true;
        this.invoiceUpdating = false;
        return;
      }
    
      if (this.auth.cashier && !ordeType && !selectedTables) {
        this.alert.createAlert("Message", "Please Select Order Type", "OK");
        this.showUpdateButtton = true;
        this.invoiceUpdating = false;
        return;
      }
    
      try {
        const response = await this.call.post(
          "ury.ury.doctype.ury_order.ury_order.sync_order",
          creatingInvoice
        );
    
        this.showUpdateButtton = true;
        if (response.message.status === "Failure") {
          const alert = response._server_messages;
          const messages = JSON.parse(alert);
          const message = JSON.parse(messages[0]);
    
          await this.alert.createAlert("Message", message.message, "OK");
          await router.push("/Table");
          window.location.reload();
          return;
        }
    
        // Handle successful response
        this.invoiceNumber = response.message.name;
        this.grandTotal = response.message.grand_total;
        this.notification.createNotification("Order Update");
        this.table.fetchTable();
        
        let items = this.menu.items;
        // items.forEach((item) => {
        //   item.comment = "";
        // });
        
        this.table.previousOrderdItem = response.message.items;
        this.recentOrders.pastOrderdItem = response.message.items;
        this.previousOrderItem.splice(0, this.previousOrderItem.length);
        this.previousOrderItem.splice(0, this.previousOrderItem.length, ...cartCopy);
        this.invoiceUpdating = false;
        this.table.modifiedTime = response.message.modified;
        this.recentOrders.modifiedTime = response.message.modified;
        if (this.auth.cashier) {
          this.clearDataAfterUpdate();
          await router.push("/recentOrder");
          this.recentOrders.viewRecentOrder(response.message);
        }
      } catch (error) {
        this.showUpdateButtton = true;
        this.invoiceUpdating = false;
        if (error === 'User cancelled the operation') {
          return; // Silently handle cancellation
        }
        if (error._server_messages) {
          const messages = JSON.parse(error._server_messages);
          const message = JSON.parse(messages[0]);
          await this.alert.createAlert("Message", message.message, "OK");
        }
      }
    },

    clearDataAfterUpdate() {
      this.menu.items.forEach((item) => {
        item.comment = "";
        item.qty = "";
      });
      this.table.cashier=""
      this.table.takeAwayTable = 0;
      this.recentOrders.restaurantTable = "";
      this.table.selectedTable = "";
      this.customers.numberOfPax = "";
      this.customers.newCustomerMobileNo=""
      this.menu.cart = [];
      this.recentOrders.draftInvoice = "";
      this.menu.selectedAggregator = "";
      this.invoiceNumber = "";
      this.tableInvoiceNo = "";
      this.customers.customerFavouriteItems = "";
      this.customers.search = "";
      this.recentOrders.pastOrderType = "";
      this.recentOrders.showOrder = false;
      this.recentOrders.invoiceNumber = "";
      this.recentOrders.setBackground = "";
      this.recentOrders.recentOrderListItems = [];
      this.recentOrders.texDetails = [];
      this.recentOrders.orderType = "";
      this.recentOrders.netTotal = 0;
      this.recentOrders.payments = [];
      this.recentOrders.grandTotal = 0;
      this.recentOrders.paidAmount = 0;
      this.recentOrders.billAmount = 0;
      this.menu.aggregatorItem = []
      this.recentOrders.invoiceNumber = "";
      this.recentOrders.selectedOrder = [];
      this.recentOrders.selectedTable = "";
      this.customers.selectedOrderType = "";
      this.menu.selectedOrderType = "";
    },
    billing(table) {
      let tables = table.name;
      const getOrderInvoice = {
        table: tables,
      };
      this.call
        .get(
          "ury.ury.doctype.ury_order.ury_order.get_order_invoice",
          getOrderInvoice
        )
        .then((result) => {
          this.tableInvoiceNo = result.message.name;
          if (
            !this.auth.hasAccess &&
            !this.auth.cashier &&
            this.auth.sessionUser !== result.message.waiter
          ) {
            this.alert.createAlert(
              "Message",
              "Printing is Blocked Table is assigned to " +
              result.message.waiter,
              "OK"
            );
          } else {
            this.isPrinting = true;
            this.printFunction();
          }
        })
        .catch((error) => console.error(error));
    },
    kotReprint() {
      this.kotPrinting=true;
      let invoice =
        this.recentOrders.draftInvoice ||
        this.table.invoiceNo ||
        this.invoiceNumber ||
        null;
      
      const invoiceData = {
        invoice_number: invoice,
      };
      this.call
        .get("ury.ury.api.ury_kot_reprint.reprint_kot", invoiceData)
        .then((result) => {
          if (result.message === "Success") {
            this.kotPrinting=false;
            this.notification.createNotification("KOT Reprint Successful");
          }
        })
        .catch((error) =>{
          console.error(error);
          this.kotPrinting=false;
          if (error._server_messages) {
            const messages = JSON.parse(error._server_messages);
            const message = JSON.parse(messages[0]);
             this.alert.createAlert("Message", message.message, "OK");
          }
        } );


    },
    printFunction: async function () {
      this.isPrinting = true;
      let invoiceNo =
        this.recentOrders.invoiceNumber ||
        this.tableInvoiceNo ||
        this.invoiceNumber;
      try {
        if (this.print_type === "qz") {
          const printHTML = {
            doc: "POS Invoice",
            name: invoiceNo,
            print_format: this.print_format,
            _lang: "en",
          };
          const result = await this.call.get(
            "frappe.www.printview.get_html_and_style",
            printHTML
          );
          if (!result?.message?.html) {
            this.isPrinting = false;
            this.alert.createAlert(
              "Message",
              "Error while getting the HTML document to print for QZ",
              "OK"
            );
            return;
          }

          const print = await printWithQz(this.qz_host, result?.message?.html);

          if (print === "printed") {
            const updateSuccess = await this.updatePrintTable(invoiceNo);
            this.isPrinting = false
            if (!updateSuccess) {
              this.notification.createNotification(
                "Print successful but failed to update status"
              );
            }
          }
        } else if (this.print_type === "network") {
          if (this.auth.cashier && !this.multipleCashier) {
            const sendObj = {
              doctype: "POS Invoice",
              name: invoiceNo,
              printer_setting: this.printer,
              print_format: this.print_format,
            };
            const printingCall = async () => {
              const res = await this.call.post(
                "ury.ury.api.ury_print.network_printing",
                sendObj
              );
              return res.message;
            };
            let i = 0;
            let errorMessage = "";
            do {
              const res = await printingCall();
              if (res === "Success") {
                this.notification.createNotification("Print Successful");
                const sendObj = {
                  invoice: invoiceNo,
                };
                await this.call
                  .post("ury.ury.api.ury_print.qz_print_update", sendObj)
                  .then(() => {
                    window.location.reload();
                    return 200;
                  });
              }
              errorMessage = res;
              i++;
            } while (i < 1);
            throw {
              alert: this.alert.createAlert(
                "Message",
                `Message:${errorMessage}`,
                "OK"
              ),
              custom: (this.isPrinting = false),
            };
          } else {
            const networkPrint = {
              invoice_id: invoiceNo,
              pos_profile: this.posProfile,
            };
            const networkPrintPrintingCall = async () => {
              const res = await this.call.post(
                "ury.ury.api.ury_print.select_network_printer",
                networkPrint
              );
              return res.message;
            };
            let i = 0;
            let errorMessage = "";
            do {
              const res = await networkPrintPrintingCall();
              if (res === "Success") {
                this.notification.createNotification("Print Successful");
                const sendObj = {
                  invoice: invoiceNo,
                };
                await this.call
                  .post("ury.ury.api.ury_print.qz_print_update", sendObj)
                  .then(() => {
                    window.location.reload();
                    return 200;
                  });
              }
              errorMessage = res;
              i++;
            } while (i < 1);
            throw {
              alert: this.alert.createAlert(
                "Message",
                `Message:${errorMessage}`,
                "OK"
              ),
              custom: (this.isPrinting = false),
            };
          }
        } else {
          // Socket printing using printview redirection
          const url = `/printview?doctype=POS Invoice&name=${invoiceNo}&format=${this.print_format}&no_letterhead=1&settings={}&letterhead=No Letterhead&trigger_print=1&_lang=en`;
          window.open(url, "_blank", "noopener,noreferrer");
          try {
            await this.call.post("ury.ury.api.ury_print.qz_print_update", {
              invoice: invoiceNo,
            });
          } catch (err) {
            console.error("Failed to update print status for socket print", err);
          }
          this.notification.createNotification("Print triggered");
          this.isPrinting = false;
        }
      } catch (e) {
        if (e?.custom) {
          this.isPrinting = false;

          return this.alert.createAlert("Error", e?.title, "OK");
        }
      }
    },
    async updatePrintTable(invoiceNo, maxRetries = 3) {
      let retryCount = 0;

      const tryUpdate = async () => {
        try {
          const updatePrintTable = {
            invoice: invoiceNo,
          };

          const response = await this.call.post(
            "ury.ury.api.ury_print.qz_print_update",
            updatePrintTable
          );
          if (response.message.status === "Success") {
            this.notification.createNotification("Print and Update Successful");
            window.location.reload();
            return true;
          } else {
            this.isPrinting = false
            throw new Error(response.message);
          }
        } catch (error) {
          console.error(`Update attempt ${retryCount + 1} failed:`, error);
          return false;
        }
      };

      while (retryCount < maxRetries) {
        const success = await tryUpdate();
        if (success) {
          return true;
        }
        retryCount++;
        if (retryCount < maxRetries) {
          // Wait for 1 second before retrying
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      this.alert.createAlert(
        "Error",
        "Failed to update print status after multiple attempts",
        "OK"
      );
      return false;
    },

    loadPrinter: async function (qz_host) {
      try {
        const res = await loadQzPrinter(url, qz_host);
        print(qz_host);
        if (res === "success")
          this.notification.createNotification("Printer loaded");
      } catch (err) {
        this.alert.createAlert("Message", err.message, "OK");
      }
    },

    showCancelInvoiceModal() {
      this.call
        .get("ury.ury.api.button_permission.cancel_check")
        .then((result) => {
          if (result.message === true) {
            this.cancelInvoiceFlag = true;
            this.cancelReason = "";
          } else {
            this.alert.createAlert(
              "Message",
              "You don't Have Permission to Cancel ",
              "OK"
            );
            this.cancelInvoiceFlag = false;
            this.cancelReason = "";
          }
        })
        .catch((error) => {
          // console.error(error)
        });
    },
    cancelInvoice: async function () {
      const recentOrders = usetoggleRecentOrder();
      let invoiceNo =
        recentOrders.invoiceNumber ||
        this.invoiceNumber ||
        this.table.invoiceNo;

      const updatedFields = {
        invoice_id: invoiceNo,
        reason: this.cancelReason,
      };
      this.call
        .post("ury.ury.doctype.ury_order.ury_order.cancel_order", updatedFields)
        .then(() => {
          this.notification.createNotification("Invoice Cancelled");
          router.push("/Table").then(() => {
            window.location.reload();
          });
        })
        .catch((error) => console.error(error));
    },
  },
});
