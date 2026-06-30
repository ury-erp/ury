import { defineStore } from "pinia";
import router from '../router';
import { useAlert } from "./Alert.js";
import { useInvoiceDataStore } from "./invoiceData.js";
import frappe from "./frappeSdk.js";

export const posClosing = defineStore("posClose", {
  state: () => ({
    invoiceData: useInvoiceDataStore(),
    call: frappe.call(),
    db: frappe.db(),
    startDate: null,
    alert:useAlert(),
    postingDate: null,
    periodEndDate: new Date(),
    posClosecreation: true,
    posOpenEntries: [],
    showPosOpen: false,
    selectedPosOpenEntry: null,
    cashier: null,
    postingTime: new Date(),
    openingBalance: [],
    closingAmount: 0,
    formattedDateTime: null,
    invoiceDetails: [],
    posInvoice: [],
    invoiceDate: null,
    amount: null,
    payments: [],
    grandTotal: 0,
    netTotal: 0,
    totalQty: 0,
    totalInvoices: 0,
    taxes: [],
    posClosingEntry: null,
    posClosing: true,
    posCloseSaved: false,
    isPosClose: null,
    showSumbitPosclose: false,
  }),
  getters: {
    isFlagSet() {
      return this.customer.length === 0;
    },
  },
  actions: {
    selectPosOpen() {
      this.db
        .getDocList("POS Opening Entry", {
          fields: ["name", "status", "branch", "docstatus"],
          filters: [
            ["status", "=", "Open"],
            ["docstatus", "=", "1"],
          ],
        })
        .then((docs) => {
          this.posOpenEntries = docs;
        })
        .catch((error) => console.error(error));

      this.showPosOpen = true;
    },
    selectPos(posOpen) {
      let posOpenEntrieName = null;
      this.selectedPosOpenEntry = posOpen.name;
      this.showPosOpen = false;
      posOpenEntrieName = posOpen.name;
      const getPosOpenEntry = {
        doctype: "POS Opening Entry",
        name: posOpenEntrieName,
      };
      this.call
        .get("frappe.client.get", getPosOpenEntry)
        .then((result) => {
          this.startDate = result.message.period_start_date;
          this.cashier = result.message.owner;
          this.openingBalance = result.message.balance_details;

          this.getInvoice();
        })
        .catch((error) => console.error(error));
    },
    getInvoice() {
      if (this.periodEndDate) {
        const date = new Date(this.periodEndDate);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const seconds = String(date.getSeconds()).padStart(2, "0");
        this.formattedDateTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      } else {
        this.formattedDateTime = null;
      }
      const PosOpenEntry = {
        start: this.startDate,
        end: this.formattedDateTime,
        pos_profile: this.invoiceData.posProfile,
        user: this.cashier,
      };
      this.call
        .get(
          "erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry.get_pos_invoices",
          PosOpenEntry
        )
        .then((result) => {
          this.invoiceDetails = result.message;
          let paymentAggregated = {};
          this.invoiceDetails.forEach((payment) => {
            this.grandTotal += parseFloat(payment.grand_total);
            this.netTotal += parseFloat(payment.net_total);
            this.totalQty += parseFloat(payment.total_qty);
            let taxes = payment.taxes;
            let combinedTaxes = {};

            taxes.forEach((item) => {
              if (!combinedTaxes[item.account_head]) {
                combinedTaxes[item.account_head] = {
                  account_head: item.account_head,
                  rate: item.rate,
                  tax_amount: 0,
                };
              }
              combinedTaxes[item.account_head].tax_amount += item.tax_amount;
            });

            this.taxes = Object.values(combinedTaxes);

            payment.payments.forEach((item) => {
              if (!paymentAggregated[item.mode_of_payment]) {
                paymentAggregated[item.mode_of_payment] = {
                  expected_amount: 0,
                  mode_of_payment: item.mode_of_payment,
                };
              }
              paymentAggregated[item.mode_of_payment].expected_amount +=
                item.amount;
            });
          });
          this.payments = Object.values(paymentAggregated);

          this.posInvoice = this.invoiceDetails.map((item) => ({
            pos_invoice: item.name,
            date: item.modified.split(" ")[0],
            amount: item.grand_total,
          }));
        })
        .catch((error) => console.error(error));
    },
    savePosClosing() {
      let formattedTime;
      if (this.postingTime) {
        const date = new Date(this.postingTime);
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const seconds = String(date.getSeconds()).padStart(2, "0");
        formattedTime = `${hours}:${minutes}:${seconds}`;
      } else {
        formattedTime = null;
      }
      let payment_reconciliation = this.openingBalance;
      payment_reconciliation.forEach((item) => {
        let found = false;
        this.payments.forEach((secondItem) => {
          if (secondItem.mode_of_payment === item.mode_of_payment) {
            item.expected_amount = secondItem.expected_amount;
            item.difference = -secondItem.expected_amount;

            found = true;
          }
        });

        if (!found) {
          item.expected_amount = 0;
          item.difference = 0;
        }
      });

      this.db
        .createDoc("POS Closing Entry", {
          period_start_date: this.startDate,
          period_end_date: this.formattedDateTime,
          posting_date: this.postingDate,
          posting_time: formattedTime,
          company: this.invoiceData.company,
          pos_profile: this.invoiceData.posProfile,
          payment_reconciliation: payment_reconciliation,
          pos_transactions: this.posInvoice,
          pos_opening_entry: this.selectedPosOpenEntry,
          user: this.cashier,
          grand_total: this.grandTotal,
          net_total: this.netTotal,
          total_quantity: this.totalQty,
          docstatus: 0,
        })
        .then((doc) => {
          this.posClosingEntry = doc.name;
          this.posClosing = false;
          this.posCloseSaved = true;
          this.isPosClose = "Draft";
        })
        .catch((error) => {
          if (error._server_messages) {
            const messages = JSON.parse(error._server_messages);
            const message = JSON.parse(messages[0]);
            this.alert.createAlert("Message",message.message, "OK")
          }
        });
    },
    getBadgeType() {
      if (this.isPosClose === "Draft") {
        return "red";
      } else if (this.isPosClose === "Submitted") {
        return "default";
      }
    },
    getBadgeText() {
      if (this.isPosClose == "Draft") {
        return "Draft";
      } else if (this.isPosClose == "Submitted") {
        return "Submitted";
      }
    },
    showSumbitPosCloseModal() {
      this.showSumbitPosclose = true;
    },
    sumbitPosClosing() {
      this.showSumbitPosclose = false;
      this.db
        .updateDoc("POS Closing Entry", this.posClosingEntry, {
          docstatus: 1,
        })
        .then((doc) => {
          this.isPosClose = "Submitted";
        })
        .catch((error) => {
          if (error._server_messages) {
            const messages = JSON.parse(error._server_messages);
            const message = JSON.parse(messages[0]);
            this.alert.createAlert("Message",message.message, "OK")
            
          }
        });
    },
    setFormattedDate() {
      const currentDate = new Date(); // Get the current date
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, "0");
      const day = String(currentDate.getDate()).padStart(2, "0");
      this.postingDate = `${year}-${month}-${day}`; // Format the date as '2023-08-24'
    },
    deleteRow(index) {
      this.openingBalance.splice(index, 1);
    },
    routeToPosClose() {
      router.push("/PosClose");
    },
  },
});
