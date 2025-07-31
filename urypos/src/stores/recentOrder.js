import { defineStore } from "pinia";
import router from "../router";
import moment from "moment";
import { useMenuStore } from "./Menu.js";
import { useCustomerStore } from "./Customer.js";
import { useNotifications } from "./Notification.js";
import { useInvoiceDataStore } from "./invoiceData.js";
import { useTableStore } from "./Table.js";
import { useAlert } from "./Alert.js";
import frappe from "./frappeSdk.js";

export const usetoggleRecentOrder = defineStore("recentOrders", {
  state: () => ({
    payments: [],
    pastOrder: [],
    texDetails: [],
    pastOrderdItem: [],
    recentOrderList: [],
    modeOfPaymentList: [],
    recentOrderListItems: [],
    next: false,
    netTotal: 0,
    paidAmount: 0,
    grandTotal: 0,
    billAmount: 0,
    currentPage: 1,
    paymentMethod: 0,
    editPrintedInvoice: 0,
    selectedStatus: "Draft",
    posProfile: "",
    searchOrder: "",
    mobileNumber: "",
    customerNameForBilling: "",
    previousOrderdCustomer: "",
    table: null,
    timer: null,
    orderType: null,
    percentage: null,
    searchTimer: null,
    postingDate: null,
    modifiedTime: null,
    recentWaiter: null,
    draftInvoice: null,
    cancelReason: null,
    pastOrderType: null,
    selectedTable: null,
    invoiceNumber: null,
    selectedOrder: null,
    totalPercentage: null,
    discount_amount: null,
    invoicePrinted: null,
    restaurantTable: null,
    modeOfPaymentName: null,
    additionalPiscountPercentage: null,
    isLoading: false,
    isChecked: false,
    showOrder: false,
    showInput: false,
    showDialog: false,
    showPayment: false,
    showDiscount: false,
    cancelInvoiceFlag: false,
    alert: useAlert(),
    call: frappe.call(),
    menu: useMenuStore(),
    tables: useTableStore(),
    customers: useCustomerStore(),
    notification: useNotifications(),
    invoiceData: useInvoiceDataStore(),
  }),
  getters: {
    filteredOrders() {
      return this.recentOrderList.filter((order) =>
        this.matchesSearchOrder(order)
      );
    },
    total() {
      return this.modeOfPaymentList.reduce(
        (acc, method) => acc + (method.value || 0),
        0
      );
    },
    change() {
      return this.billAmount - this.total;
    },
    changeAmount() {
      const totalPaid = this.payments.reduce((sum, payment) => sum + payment.amount, 0);
      return Math.max(0, totalPaid - this.grandTotal);
    },
    orderNumber() {
      if (this.draftInvoice || this.invoiceData.invoiceNumber) {
        let orderNo = this.draftInvoice || this.invoiceData.invoiceNumber;
        return orderNo;
      } else {
        return "New";
      }
    },
    totalAmount() {
      this.totalPercentage = this.grandTotal - (this.percentage / 100) * this.grandTotal;
      return this.totalPercentage.toFixed(3);
    },
  },
  actions: {
    async getPosInvoice(selectedStatus, limit, startLimit) {
      if(this.invoiceData.multipleCashier){
        const recentOrder = {
          status: selectedStatus,
          limit: limit,
          limit_start: startLimit,
          cashier:this.invoiceData.cashier
        };
        this.call
          .get("ury.ury_pos.api.getInvoiceForCashier", recentOrder)
          .then((result) => {
            console.log(result.message.data,"result.message.data")
            this.recentOrderList = result.message.data;
            this.next = result.message.next;
            return this.recentOrderList, this.next;
          })
          .catch((error) => console.error(error));
      }
      else{
      const recentOrder = {
        status: selectedStatus,
        limit: limit,
        limit_start: startLimit,
      };
      this.call
        .get("ury.ury_pos.api.getPosInvoice", recentOrder)
        .then((result) => {
          this.recentOrderList = result.message.data;
          this.next = result.message.next;
          return this.recentOrderList, this.next;
        })
        .catch((error) => console.error(error));
      }
    },
    async handleStatusChange() {
      this.currentPage = 1;
      let limit = 0;
      let startLimit = 0;
      if (this.selectedStatus === "Recently Paid") {
        limit = this.invoiceData.paidLimit;
        this.getPosInvoice(this.selectedStatus, limit, startLimit);
      } else {
        limit = 10;
        this.getPosInvoice(this.selectedStatus, limit, startLimit);
      }
    },
    async searchPosInvoice(query) {
      if (!query) {
        // If the search query is empty, fetch the original data
        this.handleStatusChange();
        return;
      }
      const searchParams = {
        query: query,
        status:this.selectedStatus
      };
      this.call
        .get("ury.ury_pos.api.searchPosInvoice", searchParams)
        .then((result) => {
          this.recentOrderList = result.message.data;
          this.next = result.message.next;
          return this.recentOrderList, this.next;
        })
        .catch((error) => console.error(error));
    },
    handleSearchInput(event) {
      clearTimeout(this.searchTimer);
      this.searchTimer=setTimeout(()=>{
        this.searchPosInvoice(event.target.value);
      },500);
    },
    
    openPaymentModal() {
      // Reset payment-related data
      this.payments = [];
      this.changeToReturn = 0;
      this.paidAmount = 0;
      
      // Reset values in payment method inputs
      this.modeOfPaymentList.forEach(method => {
        method.value = 0;
      });
      
      // Show the payment modal
      this.showPayment = true;
    },
    nextPageClick() {
      this.currentPage += 1;
      const limit = 10;
      const startLimit = (this.currentPage - 1) * limit;
      this.getPosInvoice(this.selectedStatus, limit, startLimit);
    },
    previousPageClick() {
      this.currentPage -= 1;
      const limit = 10;
      const startLimit = (this.currentPage - 1) * limit;
      this.getPosInvoice(this.selectedStatus, limit, startLimit);
    },
    matchesSearchOrder(order) {
      const query = this.searchOrder.toLowerCase();
      const name = order.name.toLowerCase();
      const customer = order.customer.toLowerCase();
      const mobileNumber = order.mobile_number.toLowerCase();

      return name.includes(query) || customer.includes(query) || mobileNumber.includes(query);
    },
    getBadgeType(selectedOrder) {
      if (
        selectedOrder.status === "Paid" ||
        selectedOrder.status === "Consolidated"
      ) {
        return "green";
      } else if (selectedOrder.status === "Return") {
        return "default";
      } else if (selectedOrder.status === "Draft") {
        return "red";
      }
    },
    getFormattedTime(postingTime) {
      const dateTime = moment(postingTime, "HH:mm:ss.SSSSSS");
      const formattedDateTime = dateTime.format("h:mma");
      return formattedDateTime;
    },

    async viewRecentOrder(recentOrder) {
      this.payments = [];
      this.tables.previousOrderdItem=[]
      this.additionalPiscountPercentage = null
      this.discountAmount = null
      this.percentage = ""
      this.showDiscount = false
      this.showInput= false
      if (recentOrder.name === this.invoiceNumber) return;
      this.orderType = recentOrder.order_type;
      this.netTotal = recentOrder.net_total;
      if (this.invoiceData.disableRoundedTotal === 1) {
        this.grandTotal = recentOrder.grand_total;
      } else {
        this.grandTotal = recentOrder.rounded_total;
      }
      this.invoiceNumber = recentOrder.name;
      this.additionalPiscountPercentage = recentOrder.additional_discount_percentage
      this.discountAmount = recentOrder.discount_amount
      this.selectedOrder = recentOrder;
      this.selectedTable = recentOrder.restaurant_table;
      const dateTimeString = `${recentOrder.posting_date}`;
      const dateTime = moment(dateTimeString, "YYYY-MM-DD");
      this.postingDate = dateTime.format("Do MMMM");
      this.invoicePrinted = recentOrder.invoice_printed;
      const getPosInvoiceItems = {
        invoice: this.invoiceNumber,
      };
      this.call
        .get("ury.ury_pos.api.getPosInvoiceItems", getPosInvoiceItems)
        .then((result) => {
          this.recentOrderListItems = result.message[0];
          this.texDetails = result.message[1];
        })
        .catch((error) => console.error(error));
      this.showOrder = true;
    },
    async editOrder() {
      this.payments = [];
      let previousOrderdNumberOfPax = "";
      this.pastOrderdItem = [];
      this.previousOrderdCustomer = "";
      this.pastOrderType = "";
      this.modifiedTime = "";
      this.customers.newCustomerMobileNo=""
      let items = this.menu.items;
      this.draftInvoice = this.invoiceNumber;
      this.editPrintedInvoice = this.invoicePrinted;
      items.forEach((item) => {
        item.qty = "";
      });
      let cart = this.menu.cart;
      cart.splice(0, cart.length);
      const getOrderInvoice = {
        doctype: "POS Invoice",
        name: this.draftInvoice,
      };
      this.call
        .get("frappe.client.get", getOrderInvoice)
        .then((result) => {
          let pastOrder = result.message;
          this.mobileNumber = pastOrder.mobile_number;
          this.restaurantTable = pastOrder.restaurant_table;
          this.pastOrderdItem = pastOrder.items;
          this.recentWaiter = pastOrder.waiter;
          this.pastOrderType = pastOrder.order_type;
          this.modifiedTime = pastOrder.modified;
          this.menu.comments= pastOrder.custom_comments;
          if (this.pastOrderType) {
            this.menu.selectedOrderType = pastOrder.order_type;
            this.menu.pickOrderType();
            if (this.pastOrderType === "Aggregators") {
              this.menu.selectedAggregator = pastOrder.customer;
            }
          }
          this.previousOrderdCustomer = pastOrder.customer;
          previousOrderdNumberOfPax = pastOrder.no_of_pax;
          router.push("/Menu");
          if (this.previousOrderdCustomer) {
            this.customers.search = this.previousOrderdCustomer;
            this.customers.numberOfPax = previousOrderdNumberOfPax;
            this.customers.fectchCustomerFavouriteItem();
          } else {
            this.customers.search = "";
            this.customers.numberOfPax = "";
            this.customers.customerFavouriteItems = "";
          }

          items.forEach((item) => {
            const previousItem =
              this.pastOrderdItem &&
              this.pastOrderdItem.find(
                (previousItem) => previousItem.item_code === item.item
              );
            if (previousItem && !item.qty) {
              const itemIndex = cart.findIndex((obj) => obj.item === item.item);
              const itemIndexExists = itemIndex !== -1;
              if (!itemIndexExists) {
                item.qty = previousItem.qty;
                item.comment = previousItem.comment;
                cart.push(item);
              }
            }
          });
          if (this.pastOrderdItem && this.pastOrderdItem.length > 0) {
            this.pastOrderdItem.forEach((previousItem) => {
              const existsInMenu = items.some(item => item.item === previousItem.item_code);
              const existsInCart = cart.some(item => item.item === previousItem.item_code);
              
              if (!existsInMenu && !existsInCart) {
                // Item no longer in menu but was in previous order - add it to cart
                cart.push({
                  item: previousItem.item_code,
                  item_name: previousItem.item_name,
                  rate: previousItem.rate,
                  qty: previousItem.qty,
                  comment: previousItem.comment
                });
              }
            });
          }
        })
        .catch((error) => console.error(error));
    },
    showInputBox() {
      this.showInput = true;
      this.showDiscount = false;
    },

    toggleDiscount() {
      if (this.showInput) {
        this.showInput = false;
        this.showDiscount = true;
      } else {
        this.showDiscount = false;
        this.showInput = true;
      }
    },

    resetTimer() {
      if (this.timer) {
        clearTimeout(this.timer);
      }
      this.timer = setTimeout(this.hideInputBox, 1000);
    },
    hideInputBox() {
      this.showInput = false;
      this.showDiscount = true;
    },
    getModeofPayment(customer) {
      if (customer) {
        const aggregator = {
          aggregator: customer,
        };
        this.call
          .get("ury.ury_pos.api.getAggregatorMOP", aggregator)
          .then((result) => {
            this.modeOfPaymentList = result.message;
          })
          .catch((error) => {
            if (error._server_messages) {
              const messages = JSON.parse(error._server_messages);
              const message = JSON.parse(messages[0]);
              this.alert.createAlert("Message", message.message, "OK");
            }
          });
      }
    },
    billing: async function () {
      this.modeOfPaymentList=[]
      this.openPaymentModal()
      const getOrderInvoice = {
        doctype: "POS Invoice",
        name: this.invoiceNumber,
      };
      this.call
        .get("frappe.client.get", getOrderInvoice)
        .then((result) => {
          this.pastOrder = result.message;
          this.customerNameForBilling = this.pastOrder.customer;
          this.posProfile = this.pastOrder.pos_profile;
          let orderType = this.pastOrder.order_type;
          if (orderType === "Aggregators") {
            this.getModeofPayment(this.pastOrder.customer);
          } else {
            this.call
              .get("ury.ury_pos.api.getModeOfPayment")
              .then((result) => {
                this.modeOfPaymentList = result.message;
              })
              .catch((error) => {
                // console.error(error)
              });
          }

          this.table = this.pastOrder.restaurant_table;
          if (this.invoicePrinted === 0) {
            this.alert.createAlert(
              "Alert",
              "Please Print Invoice before Payment",
              "OK"
            );
            this.isLoading = false;
            this.showPayment = false;

          } else {
            this.showPayment = true;
          }
        })
        .catch((error) => console.error(error));
    },

    calculatePaidAmount(paymentMethod) {
      if (this.totalPercentage) {
        this.billAmount = this.totalPercentage;
      } else {
        this.billAmount = this.grandTotal;
      }
      // this.billAmount = this.grandTotal;
      let balanceAmount = this.billAmount - this.total;
      if (balanceAmount > 0) {
        paymentMethod.value = balanceAmount;
        this.paymentMethod = paymentMethod.value;
        let existingEntryIndex = this.payments.findIndex(
          (entry) => entry.mode_of_payment === paymentMethod.mode_of_payment
        );

        if (this.paymentMethod > 0) {
          // Only proceed if payment is greater than 0
          if (existingEntryIndex !== -1) {
            // Update the existing payment entry
            this.payments[existingEntryIndex].amount = this.paymentMethod;
          } else {
            // Add a new payment entry if not found
            let paidAmount = {
              mode_of_payment: paymentMethod.mode_of_payment,
              amount: this.paymentMethod,
            };
            this.payments.push(paidAmount);
          }
        }
      }
    },

    changePaidAmount(name, value) {
      this.modeOfPaymentName = name;
      this.paidAmount = parseFloat(value) || 0;

      let existingEntryIndex = this.payments.findIndex(
        (entry) => entry.mode_of_payment === this.modeOfPaymentName
      );

      if (this.paidAmount > 0) {
        // Only add payment if it's greater than 0
        if (existingEntryIndex !== -1) {
          // Update the amount for an existing payment method
          this.payments[existingEntryIndex].amount = this.paidAmount;
        } else {
          // Add a new payment entry if not found
          let paidAmount = {
            mode_of_payment: this.modeOfPaymentName,
            amount: this.paidAmount,
          };
          this.payments.push(paidAmount);
        }
      } else if (existingEntryIndex !== -1) {
        // Optionally remove the payment if the amount is 0
        this.payments.splice(existingEntryIndex, 1);
      }
    },

    //Making Payment
    makePayment: async function () {

      this.isLoading = true;
      const invoicePayment = {
        table: this.selectedTable,
        invoice: this.invoiceNumber,
        customer: this.customerNameForBilling,
        owner:this.invoiceData.owner,
        cashier: this.invoiceData.cashier,
        payments: this.payments,
        pos_profile: this.posProfile,
        additionalDiscount: this.percentage
      };
      let pay = this.payments;
      let amount = pay.reduce((total, obj) => obj.amount + total, 0);
      let r_total = this.grandTotal;
      let diff = r_total - amount;
      if (diff > 5 && !this.percentage) {
        this.alert.createAlert("Message", "Round Off Limit Exceeded", "OK");
        this.isLoading = false;
      } else {
        this.call
          .post(
            "ury.ury.doctype.ury_order.ury_order.make_invoice",
            invoicePayment
          )
          .then(() => {
            this.notification.createNotification("Payment Completed");
            this.getPosInvoice(this.selectedStatus, 10, 0);
            this.clearData();
          })
          .catch((error) => {
            this.isLoading = false;
            const messages = JSON.parse(error._server_messages);
            const message = JSON.parse(messages[0]);
            this.alert.createAlert("Message", message.message, "OK");
          });
      }
    },
    clearData() {
      this.menu.selectedOrderType = "";
      this.isLoading = false;
      this.pastOrderType = "";
      this.menu.items.forEach((item) => {
        item.comment = "";
        item.qty = "";
      });
      this.selectedStatus = "Draft";
      this.menu.cart = [];
      this.draftInvoice = "";
      this.customers.selectedOrderType = "";
      this.menu.selectedAggregator = "";
      this.invoiceData.invoiceNumber = "";
      this.customers.customerFavouriteItems = "";
      this.customers.search = "";
      this.invoiceData.tableInvoiceNo = "";
      this.pastOrderType = "";
      this.netTotal = 0;
      this.paidAmount = 0;
      this.grandTotal = 0;
      this.billAmount = 0;
      this.payments = [];
      this.showOrder = false;
      this.customerNameForBilling = "";
      this.invoiceNumber = "";
      this.setBackground = "";
      this.recentOrderListItems = [];
      this.texDetails = [];
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
      const updatedFields = {
        invoice_id: this.invoiceNumber,
        reason: this.cancelReason,
      };
      this.call
        .post("ury.ury.doctype.ury_order.ury_order.cancel_order", updatedFields)
        .then(() => {
          this.notification.createNotification("Invoice Cancelled");
          window.location.reload();
        })
        .catch((error) => console.error(error));
    },
    toggleRecentOrders() {
      router.push("/recentOrder");
    },
  },
});
