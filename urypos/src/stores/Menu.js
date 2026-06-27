import { defineStore } from "pinia";
import { useInvoiceDataStore } from "./invoiceData.js";
import { useTableStore } from "./Table.js";
import { useNotifications } from "./Notification.js";
import { useCustomerStore } from "./Customer.js";
import { useAuthStore } from "./Auth.js";
import frappe from "./frappeSdk.js";
import { usetoggleRecentOrder } from "./recentOrder.js";
import { useAlert } from "./Alert.js";
import router from "../router";


export const useMenuStore = defineStore("menu", {
  state: () => ({
    cart: [],
    item: [],
    items: [],
    course: [],
    orderType: [],
    defautlMenu: [],
    aggregatorList: [],
    aggregatorItem: [],
    quantity: "",
    comments: "",
    searchTerm: "",
    itemComments: "",
    perPage: 20,
    currentPage: 1,
    aggregatorId: null,
    selectedCourse: null,
    selectedOrderType: null,
    selectedAggregator: null,
    showAll: true,
    displayAll: true,
    isAggregator: false,
    priority: false,
    showDialog: false,
    showPriority: false,
    showDialogCart: false,
    db: frappe.db(),
    call: frappe.call(),
  }),
  getters: {
    filteredItems(state) {
      if (
        typeof state.searchTerm !== "string" ||
        state.searchTerm.trim() === ""
      ) {
        if (state.showAll) {
          if (state.selectedCourse) {
            return state.items.filter(
              (item) => item.course === state.selectedCourse
            );
          } else {
            return state.items; // Return all items if no course is selected
          }
        } else {
          if (state.selectedCourse) {
            return state.items.filter(
              (item) =>
                item.special_dish === 1 && item.course === state.selectedCourse
            );
          } else {
            return state.items.filter((item) => item.special_dish === 1);
          }
        }
      } else {
        const searchTerm = state.searchTerm.toLowerCase();
        return state.items.filter(
          (item) =>
            typeof item.item_name === "string" &&
            typeof item.item === "string" &&
            (item.item_name.toLowerCase().includes(searchTerm) ||
              item.item.toLowerCase().includes(searchTerm)) &&
            (!state.selectedCourse || item.course === state.selectedCourse) &&
            (state.showAll || item.special_dish === 1)
        );
      }
    },
    totalPages() {
      return Math.ceil(this.filteredItems.length / this.perPage);
    },
    paginatedItems() {
      const startIndex = (this.currentPage - 1) * this.perPage;
      const endIndex = startIndex + this.perPage;
      return this.filteredItems.slice(startIndex, endIndex);
    },
    pageNumbers() {
      const pageNumbers = [];
      for (let i = 1; i <= this.totalPages; i++) {
        pageNumbers.push(i);
      }
      return pageNumbers;
    },
    setColorForBilledInvoice() {
      const recentOrders = usetoggleRecentOrder();
      const auth = useAuthStore();
      if (
        recentOrders.editPrintedInvoice === 0 ||
        auth.removeTableOrderItem === 1
      ) {
        return "black";
      } else if (
        recentOrders.editPrintedInvoice === 1 ||
        auth.removeTableOrderItem === 0
      ) {
        return "gray";
      }
    },
    grand_total() {
      return this.cart
        .reduce((total, item) => {
          return total + parseFloat(item.rate) * item.qty;
        }, 0)
        .toFixed(2);
    },
  },
  actions: {
    fetchItems() {
      const auth = useAuthStore();
      const invoiceData = useInvoiceDataStore();
      const table = useTableStore();
      const alert = useAlert();
      let order_type = null
      if (auth.cashier) {
        order_type = this.selectedOrderType;
      }else{
        order_type = null
      }
      const getMenu = {
        pos_profile: invoiceData.posProfile,
        order_type:order_type
      };
      this.call
        .get("ury.ury_pos.api.getRestaurantMenu", getMenu)
        .then((result) => {
          if (!auth.cashier && table.tableMenu) {
            this.items = table.tableMenu;
          } else {
            this.defautlMenu = result.message.items;
            this.items = this.defautlMenu;
          }
          this.items.forEach((menuItem) => {
            if (menuItem.special_dish == 1) {
              this.showPriority = true;
            } else {
              this.showAll = true;
            }
          });
        })
        .catch((error) => {
          if (error._server_messages) {
            const messages = JSON.parse(error._server_messages);
            const message = JSON.parse(messages[0]);
            alert.createAlert("Message", message.message, "OK");
          }
        });
      this.db
        .getDocList("URY Menu Course", {
          fields: ["name"],
          limit: "*",
        })
        .then((docs) => {
          this.course = docs;
        });
    },
    pickOrderType() {
      this.call
        .get("ury.ury_pos.api.get_select_field_options")
        .then((result) => {
          this.orderType = result.message.filter(
            (option) => option.name !== ""
          );
        })
        .catch((error) => console.error(error));
    },
    clearPreviousData() {
      const recentOrders = usetoggleRecentOrder();
      const table = useTableStore();
      const invoiceData = useInvoiceDataStore();
      const customer = useCustomerStore();
      recentOrders.selectedTable = "";
      recentOrders.previousOrderdCustomer = ""
      recentOrders.selectedStatus = "Draft"
      table.invoiceNo = "";
      table.selectedTable = "";
      invoiceData.invoiceNumber = "";
      recentOrders.showOrder = "";
      recentOrders.invoiceNumber = "";
      recentOrders.recentOrderListItems = [];
      recentOrders.texDetails = [];
      recentOrders.orderType = "";
      recentOrders.draftInvoice = "";
      recentOrders.netTotal = 0;
      recentOrders.grandTotal = 0;
      recentOrders.invoiceNumber = "";
      recentOrders.selectedOrder = [];
      recentOrders.selectedTable = "";
      customer.search = "";
      recentOrders.restaurantTable = ""
      recentOrders.restaurantTable = null
      this.aggregatorItem = []
    },
    orderTypeSelection() {
      const customer = useCustomerStore();
      const recentOrders = usetoggleRecentOrder();
      const alert = useAlert();
      this.clearPreviousData();
      customer.selectedOrderType = this.selectedOrderType;
      if (
        this.selectedOrderType === "Dine In" &&
        !recentOrders.restaurantTable
      ) {
        this.selectedOrderType = null;
        alert.createAlert(
          "Message",
          "Dine in is not permitted for takeaway orders.",
          "OK"
        );
      } else {
        if (this.selectedOrderType !== "Aggregators") {
          this.fetchItems()
          router.push("/Menu");
        }
      }

      if (this.cart.length > 0) {
        alert
          .createAlert(
            "Cart Not Empty",
            "Please clear your cart before selecting an order type.",
            "OK"
          )
          .then(() => {
            router.push("/Table").catch(() => {});
          });
      } else {
        if (this.selectedOrderType === "Aggregators") {
          this.call
            .get("ury.ury_pos.api.getAggregator")
            .then((result) => {
              this.aggregatorList = result.message;
            })
            .catch((error) => {
              if (error._server_messages) {
                const messages = JSON.parse(error._server_messages);
                const message = JSON.parse(messages[0]);
                alert.createAlert("Message", message.message, "OK");
              }
            });
        } else {
          this.aggregatorItem = "";
          this.selectedAggregator = "";
          this.items = this.defautlMenu;
        }
      }
    },
    handleAggregatorChange() {
      const customer = useCustomerStore();
      const alert = useAlert();
      if (this.selectedOrderType === "Aggregators" && this.cart.length > 0) {
        alert
          .createAlert(
            "Cart Not Empty",
            "Please empty your cart before selecting an aggregator.",
            "OK"
          )
          .then(() => {
            router.push("/Table").catch(() => {});
          });
      } else {
        customer.search = this.selectedAggregator;
        const getMenu = {
          aggregator: this.selectedAggregator,
        };
        this.call
          .get("ury.ury_pos.api.getAggregatorItem", getMenu)
          .then((result) => {
            this.aggregatorItem = this.items = result.message;
            router.push("/Menu");
            if (result.message) {
              this.items = result.message;
            } else {
              this.items = this.defautlMenu;
            }
          })
          .catch((error) => {
            if (error._server_messages) {
              const messages = JSON.parse(error._server_messages);
              const message = JSON.parse(messages[0]);
              alert.createAlert("Message", message.message, "OK");
            }
          });
      }
    },
    itemNameExtract(item_name) {
      return item_name
        ? item_name
          .split(" ")
          .map((word) => (word ? word[0].toUpperCase() : ""))
          .join("")
          .substring(0, 2)
        : "";
    },
    updateSearchTerm() {
      this.currentPage = 1;
    },
    getFullImagePath(relativePath) {
      return `${frappe.url}${relativePath}`;
    },

    handleSearchInput(event) {
      this.searchTerm = event.target.value;
      this.updateSearchTerm();
    },
    clearSearch(event) {
      event.target.value = "";
      this.searchTerm = "";
    },
    showAllItems() {
      this.showAll = true;
      this.priority = false;
      this.displayAll = true;
      this.searchTerm = "";
      this.selectedCourse = "";
    },
    showSpecialItems() {
      this.priority = true;
      this.displayAll = false;
      this.showAll = false;
    },
    showModal(item) {
      this.showDialog = true;
      this.quantity = item.qty;
      this.item = item;
      this.itemComments = item.comment;
    },

    addToCartAndUpdateQty() {
      const item = this.item;

      if (
        this.quantity !== null &&
        this.quantity !== undefined &&
        this.quantity !== "" &&
        this.quantity > 0
      ) {
        if (!item.qty) {
          item.qty = this.quantity;
        } else {
          item.qty = this.quantity;
          item.comment = this.itemComments;
        }
      }

      this.showDialog = false;
    },

    getitemQty(item) {
      item.qty = this.cart.qty;
    },
    addToCart(item) {
      const notification = useNotifications();
      const itemIndex = this.cart.findIndex((obj) => obj.item === item.item);
      const itemIndexExists = itemIndex !== -1;

      if (!itemIndexExists) {
        item.qty = 1;
        item.comment = "";
        this.cart.push(item);

        let message = `Added ${item.item} to Cart`;
        notification.createNotification(message);
      }
    },
    incrementItemQuantity(item) {
      const invoiceData = useInvoiceDataStore();
      const table = useTableStore();
      const notification = useNotifications();
      const itemIndex = this.cart.findIndex((obj) => obj.item === item.item);
      const itemIndexExists = itemIndex !== -1;
      const posProfile = invoiceData.posProfile;
      let previousOrderItem = table.previousOrderdItem;
      // Check if item exists in previous orders
      const previousItem = previousOrderItem.find(
        (previous_item) => previous_item.item_code === item.item
      );

      let item_qty = itemIndexExists ? this.cart[itemIndex].qty + 1 : 1;
      // If item exists in previous orders, adjust quantity
      if (previousItem) {
        item_qty -= previousItem.qty;
      }
      if (itemIndexExists) {
        item.comment = "";
        this.cart[itemIndex].qty++;
        let message = `${item.item}'s Qty updated to ${item.qty} in Cart`;
        notification.createNotification(message);
      } else {
        item.comment = "";
        this.cart.push({ item: item.item, qty: 1 });
      }
    },
    decrementItemQuantity(item) {
      const notification = useNotifications();
      const itemIndex = this.cart.findIndex((obj) => obj.item === item.item);
      const itemIndexExists = itemIndex !== -1;
      if (itemIndexExists) {
        this.cart[itemIndex].qty--;
        this.cart = this.cart.filter((obj) => obj.qty > 0);
        let message =
          item.qty > 0
            ? `${item.item}'s Qty Reduced from Cart Total Qty=${item.qty}`
            : `${item.item} has been removed from Cart`;
        notification.createNotification(message);
      }
    },
    removeItemFromCart(index) {
      // Get the item that corresponds to the index
      const item = this.cart[index];
      // Set the item's quantity to zero
      item.qty = 0;
      this.cart.splice(index, 1);
    },
  },
});