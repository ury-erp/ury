import { defineStore } from "pinia";
import { useTableStore } from "./Table.js";
import { useNotifications } from "./Notification.js";
import { usetoggleRecentOrder } from "./recentOrder.js";
import { useMenuStore } from "./Menu.js";
import frappe from "./frappeSdk.js";
import { useAlert } from "./Alert.js";
export const useCustomerStore = defineStore("customers", {
  state: () => ({
    customer: [],
    notification: useNotifications(),
    search: "",
    alert: useAlert(),
    showCustomers: false,
    showOrderType: false,
    showEditOrderType: false,
    newOrderType: null,
    numberOfPax: "",
    menu: useMenuStore(),
    recentOrders: usetoggleRecentOrder(),
    selectedCustomerName: "",
    customerFavouriteItems: [],
    showModalNewCustomer: false,
    newCustomerMobileNo: "",
    newCustomer: "",
    orderType: [],
    table: useTableStore(),
    showCustomersGroup: false,
    showCustomersTerritory: false,
    showAddNewCustomer: true,
    customerTerritoryList: [],
    customerTerritory: null,
    customerGroupList: [],
    customerGroup: null,
    call: frappe.call(),
    db: frappe.db(),
    timer: null,
  }),
  getters: {
    isFlagSet() {
      return this.customer.length === 0;
    },
  },
  actions: {
    async pickCustomer() {
      if (!this.search.trim()) {
        this.customer = [];
        return;
      }

      const getscramblePattern = (text) => {
        return `%${text.split("").join("%")}%`;
      };

      const pattern = getscramblePattern(this.search);

      const searchParams = {
        fields: ["name", "customer_name", "mobile_number"],
        orFilters: [
          ["customer_name", "like", pattern],
          ["mobile_number", "like", pattern],
          ["name", "like", pattern],
        ],
        limit: 5,
        limit_start: 0,
      };

      this.db
        .getDocList("Customer", searchParams)
        .then((docs) => {
          this.customer = docs.map((doc) => ({
            ...doc,
            content: `Customer Name : ${doc.customer_name ?? ""} | Mobile Number : ${doc.mobile_number ?? ""
              }`,
          }));
        })
        .catch((error) => console.error(error));
    },
    handleSearchInput(event) {
      this.search = event.target.value;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.pickCustomer();
      }, 500);
    },
    pickCustomerGroup() {
      this.db
        .getDocList("Customer Group")
        .then((docs) => {
          this.customerGroupList = docs;
        })
        .catch((error) => console.error(error));
    },
    selectCustomerGroup(group) {
      this.customerGroup = group.name;
      this.showCustomersGroup = false;
    },
    pickCustomerTerritory() {
      this.db
        .getDocList("Territory")
        .then((docs) => {
          this.customerTerritoryList = docs;
        })
        .catch((error) => console.error(error));
    },
    selectCustomerTerritory(group) {
      this.customerTerritory = group.name;
      this.showCustomersTerritory = false;
    },
    newCustomerData(name) {
      this.showModalNewCustomer = true;
      if (!isNaN(parseFloat(name)) && isFinite(name)) {
        this.newCustomerMobileNo = name;
      } else if (typeof name === "string") {
        this.newCustomer = name;
      } else {
        this.alert.createAlert("Message", "Invalid Customer", "OK");
      }
    },
    editOrderType(orderType) {
      this.showEditOrderType = true;
      if (orderType == "Take Away") {
        this.newOrderType = "Delivery";
      } else if (orderType == "Delivery") {
        this.newOrderType = "Take Away";
      } else {
        return;
      }
    },
    selecetOrderType(order_type) {
      this.showEditOrderType = false;
      this.menu.selectedOrderType = order_type;
      this.recentOrders.pastOrderType = order_type;
    },

    addNewCustomer: async function () {
      if (!this.newCustomer || !this.newCustomerMobileNo) {
        let missingFields = [];
        if (!this.newCustomer) {
          missingFields.push("Customer Name");
        }
        if (!this.newCustomerMobileNo) {
          missingFields.push("Mobile Number");
        }
        if (!this.customerGroup) {
          missingFields.push("Customer Group");
        }
        if (!this.customerTerritory) {
          missingFields.push("Territory");
        }
        const missingFieldsMessage =
          "Following fields have missing values: " + missingFields.join(", ");
        this.alert.createAlert("Message", missingFieldsMessage, "OK");
      } else {
        this.showAddNewCustomer = false;
        const db = frappe.db();
        db.createDoc("Customer", {
          customer_name: this.newCustomer,
          mobile_number: this.newCustomerMobileNo.toString(),
          customer_group: this.customerGroup,
          territory: this.customerTerritory,
        })
          .then((doc) => {
            this.search = doc.name;
            this.notification.createNotification("New Customer Created");
            this.showModalNewCustomer = false;
          })
          .catch((error) => {
            const serverMessages = JSON.parse(error._server_messages);
            const messageObject = JSON.parse(serverMessages[0]);
            const message = messageObject.message;
            this.alert.createAlert("Message", message, "OK");
          });
      }
    },
    extractName(content) {
      if (content) {
        const mobileStartIndex = content.indexOf("Mobile Number :");
        if (mobileStartIndex !== -1) {
          // Check for new delimiter '|' or end of string
          let mobileEndIndex = content.indexOf("|", mobileStartIndex);
          if (mobileEndIndex === -1) {
            // If no | found, check for old delimiter ||| just in case, but mostly it might be end of string
            mobileEndIndex = content.indexOf("|||", mobileStartIndex);
          }

          // If still -1, it means it might be at the end of the string
          if (mobileEndIndex === -1) {
            mobileEndIndex = content.length;
          }

          if (mobileEndIndex !== -1) {
            const mobileNumber = content
              .substring(mobileStartIndex + "Mobile Number :".length, mobileEndIndex)
              .trim();

            return mobileNumber;
          }
        }
      }
      return "";
    },
    searchCustomer() {
      if (this.menu.selectedAggregator) {
        this.showCustomers = false;
        this.showAddNewCustomer = false;
      } else {
        this.showCustomers = true;
        this.showAddNewCustomer = true;
      }
    },
    async selectCustomer(customer) {
      this.search = customer.name;

      // Use direct property if available (new method), fallback to parsing (old method/compatibility)
      if (customer.mobile_number) {
        this.newCustomerMobileNo = customer.mobile_number;
      } else {
        const content = customer.content;
        const mobileNumber = this.extractName(content);
        if (mobileNumber) {
          this.newCustomerMobileNo = mobileNumber;
        }
      }

      this.showCustomers = false;
      this.fectchCustomerFavouriteItem();
    },
    validateInput(event) {
      let value = event.target.value;
      if (value < 1) {
        this.numberOfPax = "";
        return;
      }

      if (value.toString().length > 3) {
        this.numberOfPax = value.toString().slice(0, 3);
      } else {
        this.numberOfPax = value;
      }
    },
    async fectchCustomerFavouriteItem() {
      if (this.table.previousOrderdCustomer) {
        this.selectedCustomerName = this.table.previousOrderdCustomer;
      } else {
        this.selectedCustomerName = this.search;
      }

      const searchParams = {
        customer_name: this.selectedCustomerName,
      };

      this.call
        .get(
          "ury.ury.doctype.ury_order.ury_order.customer_favourite_item",
          searchParams
        )
        .then((result) => {
          this.customerFavouriteItems = [];
          result.message.forEach((item) => {
            this.customerFavouriteItems.push(item);
          });
        })
        .catch((error) => console.error(error));
    },
  },
});
