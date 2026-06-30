import { defineStore } from "pinia";
import router from "../router";
import { useInvoiceDataStore } from "./invoiceData.js";
import { useAlert } from "./Alert.js";
import frappe from "./frappeSdk.js";

export const posOpening = defineStore("posOpen", {
  state: () => ({
    invoiceData: useInvoiceDataStore(),
    call: frappe.call(),
    startDate: new Date(),
    formattedDateTime: null,
    postingDate: null,
    alert: useAlert(),
    posOpencreation: true,
    currentDate: new Date(),
    posOpenSaved: false,
    posOpenEntryName: null,
    db: frappe.db(),
    showSumbitPosOpen: false,
    isPosOpen: null,
  }),
  getters: {
    currentDateTime: {
      get() {},
    },
  },
  actions: {
    savePosOpening() {
      if (this.startDate) {
        const date = new Date(this.startDate);
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

      this.db
        .createDoc("POS Opening Entry", {
          period_start_date: this.formattedDateTime,
          posting_date: this.postingDate,
          company: this.invoiceData.company,
          pos_profile: this.invoiceData.posProfile,
          balance_details: this.invoiceData.modeOfPaymentList,
          branch: this.invoiceData.branch,
          user: this.invoiceData.cashier,
          docstatus: 0,
        })
        .then((doc) => {
          this.posOpenEntryName = doc.name;
          this.posOpencreation = false;
          this.posOpenSaved = true;
          this.isPosOpen = "Draft";
        })
        .catch((error) => {
          if (error._server_messages) {
            const messages = JSON.parse(error._server_messages);
            const message = JSON.parse(messages[0]);
            this.alert.createAlert("Message", message.message, "OK");
          }
        });
    },
    getBadgeType() {
      if (this.isPosOpen == "Draft") {
        return "red";
      } else if (this.isPosOpen == "Open") {
        return "yellow";
      }
    },
    getBadgeText() {
      if (this.isPosOpen == "Draft") {
        return "Draft";
      } else if (this.isPosOpen == "Open") {
        return "Open";
      }
    },

    showSumbitPosOpenModal() {
      this.showSumbitPosOpen = true;
    },
    sumbitPosOpening() {
      this.showSumbitPosOpen = false;
      this.db
        .updateDoc("POS Opening Entry", this.posOpenEntryName, {
          docstatus: 1,
        })
        .then((doc) => {
          this.isPosOpen = "Open";
        })
        .catch((error) => console.error(error));
    },
    setFormattedDate() {
      const year = this.currentDate.getFullYear();
      const month = String(this.currentDate.getMonth() + 1).padStart(2, "0");
      const day = String(this.currentDate.getDate()).padStart(2, "0");
      this.postingDate = `${year}-${month}-${day}`;
    },
    deleteRow(index) {
      this.invoiceData.modeOfPaymentList.splice(index, 1);
    },
    routeToPosOpen() {
      router.push("/posOpen");
    },
  },
});
