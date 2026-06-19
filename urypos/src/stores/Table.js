import { defineStore } from "pinia";
import router from "../router";
import { useMenuStore } from "./Menu.js";
import { useInvoiceDataStore } from "./invoiceData.js";
import { useAuthStore } from "./Auth.js";
import { useCustomerStore } from "./Customer.js";
import { useNotifications } from "./Notification.js";
import { useAlert } from "./Alert.js";
import frappe from "./frappeSdk.js";
import { usetoggleRecentOrder } from "./recentOrder.js";


export const useTableStore = defineStore("table", {
  state: () => ({
    tables: [],
    selectedTable: null,
    previousOrderdItem: [],
    invoiceNo: "",
    takeAwayTable: 0,
    alert: useAlert(),
    previousOrder: [],
    previousOrderdCustomer: "",
    invoiceData: useInvoiceDataStore(),
    grandTotal: "",
    notification: useNotifications(),
    selectedOption: "",
    isTakeAway: "",
    mobileNumber: "",
    showModal: false,
    isTakeaeay: false,
    newTable: "",
    showTable: false,
    transferTable: [],
    menu: useMenuStore(),
    tableMenu: [],
    activeDropdown: null,
    currentCaptain: null,
    tableName: "",
    showModalCaptainTransfer: false,
    showCaptain: false,
    cashier: null,
    captain: [],
    previousWaiter: null,
    newCaptain: "",
    invoicePrinted: "",
    auth: useAuthStore(),
    call: frappe.call(),
    customers: useCustomerStore(),
    db: frappe.db(),
    totalMinutes: null,
    invoiceNumber: null,
    modifiedTime: null,
    selectedRoom: null,
    orderModified: null,
    menuName: null,
    rooms: [],
    recentOrders: usetoggleRecentOrder()
  }),
  getters: {
    filteredTables(state) {
      return state.tables.filter((table) => table.is_take_away === 0);
    },
    takeAway(state) {
      return state.tables.filter((table) => table.is_take_away === 1);
    },
    searchTable() {
      return this.transferTable.filter((table) => {
        return table.name.toLowerCase().includes(this.newTable.toLowerCase());
      });
    },
    searchCaptian() {
      return this.captain.filter((ordeTakers) => {
        return ordeTakers.name
          .toLowerCase()
          .includes(this.newCaptain.toLowerCase());
      });
    },
    toggleTableType(state) {
      return state.isTakeaeay ? "translateX(215%)" : "translateX(0)";
    },
    tableTypeLabel(state) {
      return state.isTakeaeay ? "Takeaway" : "Table";
    },
    tableTypeClass(state) {
      return state.isTakeaeay ? "text-left ml-1" : "text-center ml-2";
    },
  },
  actions: {
    fetchRoom() {
      this.selectedOption = "Table";
      if (this.invoiceData.multipleCashier) {
        this.call.get("ury.ury_pos.api.getRoom").then((result) => {
          this.rooms = result.message;
          const selectedRoom = localStorage.getItem("selectedRoom");
          if (
            selectedRoom !== null &&
            selectedRoom !== "" &&
            selectedRoom !== "null"
          ) {
            this.selectedRoom = selectedRoom;
            this.handleRoomChange();
          }

        });
      } else {
        this.db
          .getDocList("URY Room", {
            fields: ["name", "branch"],
            filters: [["branch", "like", this.invoiceData.branch]],
            limit: "*",
          })
          .then((docs) => {
            this.rooms = docs;
            const selectedRoom = localStorage.getItem("selectedRoom");
            if (
              selectedRoom !== null &&
              selectedRoom !== "" &&
              selectedRoom !== "null"
            ) {
              this.selectedRoom = selectedRoom;
              this.handleRoomChange();
            } else {
              this.db
                .getDocList("URY Restaurant", {
                  fields: ["branch", "default_room"],
                  filters: [["branch", "like", this.invoiceData.branch]],
                })
                .then((docs) => {
                  let room = docs.find((room) => room.default_room);
                  this.selectedRoom = room ? room.default_room : null;

                  this.handleRoomChange();
                });
            }

          })
          .catch((error) => console.error(error));
      }
    },
    async handleRoomChange() {
      localStorage.setItem("selectedRoom", this.selectedRoom);
      await this.fetchTable();
      await this.getMenu();
      if (this.invoiceData.multipleCashier) {
        this.getCashier()
      }
    },
    getCashier() {
      const getCashier = {
        room: this.selectedRoom,
      };
      this.call.get("ury.ury_pos.api.getCashier", getCashier).then((result) => {
        this.cashier = result.message
      });
    },
    fetchTable() {
      this.db
        .getDocList("URY Table", {
          fields: [
            "name",
            "occupied",
            "latest_invoice_time",
            "is_take_away",
            "restaurant_room",
            "table_shape",
            "no_of_seats",
            "layout_x",
            "layout_y",
            "minimum_seating",
          ],
          filters: [["restaurant_room", "=", this.selectedRoom]],
          limit: "*",
        })
        .then((tables) => {
          this.tables = tables.sort((a, b) => {
            return a.name.localeCompare(b.name, undefined, {
              numeric: true,
              sensitivity: "base",
            });
          });
        });
    },
    async getMenu() {
      const getMenuIem = {
        room: this.selectedRoom,
        pos_profile: this.invoiceData.posProfile,
      };
      try {
        await this.call
          .get("ury.ury_pos.api.getRestaurantMenu", getMenuIem)
          .then((result) => {
            this.tableMenu = result.message.items;
            this.menuName = result.message.name;
            this.orderModified = result.message.modified;
            this.menu.fetchItems();
          });
      } catch (error) {
        if (error._server_messages) {
          const messages = JSON.parse(error._server_messages);
          const message = JSON.parse(messages[0])
          this.alert.createAlert("Message", message.message, "OK");
        }
      }
    },
    toggleTableTypeSwitch() {
      this.isTakeaeay = !this.isTakeaeay;
    },
    tableSearch() {
      this.db
        .getDocList("URY Table", {
          filters: [["occupied", "like", "0%"]],
          limit: "*",
        })
        .then((table) => {
          this.transferTable = table;
        })
        .catch((error) => {
          console.error(error);
        });
    },
    fetchCaptain() {
      this.db
        .getDocList("User", {
          fields: ["name"],
          limit: "*",
        })
        .then((docs) => {
          this.captain = docs;
        })
        .catch((error) => console.error(error));
    },
    async toggleDropdown(index) {
      this.tableName = index;
      if (this.activeDropdown === index) {
        this.activeDropdown = null;
      } else {
        this.activeDropdown = index;
      }
      await this.invoiceNumberFetching();
    },
    hideDropdown() {
      this.activeDropdown = null;
    },
    selectTable(tables) {
      this.newTable = tables.name;
      this.showTable = false;
    },
    selectcaptain(captain) {
      this.newCaptain = captain.name;
      this.showCaptain = false;
    },
    getTimeDifference(table) {
      const now = new Date();
      let tableTime = "00:00:00";
      if (table && table.occupied === 1 && table.latest_invoice_time) {
        tableTime = table.latest_invoice_time;
      }
      const [tableHours, tableMinutes, tableSeconds] = tableTime.split(":");
      const tableDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        tableHours,
        tableMinutes,
        tableSeconds
      );
      const timeDifferenceInMs = now - tableDate;
      const secondsDifference = Math.floor(timeDifferenceInMs / 1000);
      const minutesDifference = Math.floor(secondsDifference / 60);
      const hoursDifference = Math.floor(minutesDifference / 60);
      const formattedTimeDifference = `${hoursDifference}:${minutesDifference % 60
        }`;
      return formattedTimeDifference;
    },
    getBadgeType(table) {
      if (table.occupied != 1 && table.name !== this.selectedTable) {
        return "green";
      } else if (table.name === this.selectedTable) {
        return "default";
      } else if (table.occupied === 1 && table.name !== this.selectedTable) {
        const timeDifference = this.getTimeDifference(table);
        const [hours, minutes] = timeDifference.split(":");
        const totalMinutes = parseInt(hours) * 60 + parseInt(minutes);
        if (totalMinutes > this.invoiceData.tableAttention) {
          return "red";
        } else {
          return "yellow";
        }
      }
    },
    getBadgeText(table) {
      if (table.occupied != 1 && table.name !== this.selectedTable) {
        return "Free";
      } else if (table.name === this.selectedTable) {
        return "Active";
      } else if (table.occupied === 1 && table.name !== this.selectedTable) {
        const timeDifference = this.getTimeDifference(table);
        const [hours, minutes] = timeDifference.split(":");
        const totalMinutes = parseInt(hours) * 60 + parseInt(minutes);
        if (totalMinutes > this.invoiceData.tableAttention) {
          return "Attention";
        } else {
          return "Occupied";
        }
      }
    },
    async addToSelectedTables(table) {
      this.selectedTable = table.name;
      this.takeAwayTable = 0;

      if (table.is_take_away === 1) {
        this.isTakeAway = "Take Away";
        this.takeAwayTable = 1;
      }
      let previousOrderdNumberOfPax = "";
      this.previousOrderdItem = [];
      this.recentOrders.modifiedTime = ""
      this.recentOrders.pastOrderdItem = []
      this.invoiceNo = "";
      let items = this.tableMenu;
      items.forEach((item) => {
        item.qty = "";
      });
      let cart = this.menu.cart;
      cart.splice(0, cart.length);
      const getPreviousOrder = {
        table: this.selectedTable,
      };
      this.call
        .get(
          "ury.ury.doctype.ury_order.ury_order.get_order_invoice",
          getPreviousOrder
        )
        .then((result) => {
          this.previousOrder = result.message;
          this.invoicePrinted = this.previousOrder.invoice_printed;
          this.menu.comments = this.previousOrder.custom_comments;
          this.modifiedTime = this.previousOrder.modified;
          this.grandTotal = this.previousOrder.grand_total;
          this.mobileNumber = this.previousOrder.mobile_number;
          this.invoiceNo = this.previousOrder.name;
          this.previousWaiter = this.previousOrder.waiter;
          if (this.invoiceNo) {
            if (
              !this.auth.hasAccess &&
              !this.auth.cashier &&
              this.auth.sessionUser !== this.previousOrder.waiter
            ) {
              this.alert
                .createAlert(
                  "Message",
                  "Table is assigned to " + this.previousOrder.waiter,
                  "OK"
                )
                .then(() => {
                  router.push("/Table").then(() => {
                    window.location.reload();
                  });
                });
            } else {
              this.notification.createNotification("Past Order Fetched");
            }
          } else {
            router.push("/Menu");
          }
          this.previousOrderdItem = this.previousOrder.items;
          this.previousOrderdCustomer = this.previousOrder.customer;
          previousOrderdNumberOfPax = this.previousOrder.no_of_pax;
          if (this.previousOrderdCustomer) {
            this.customers.search = this.previousOrderdCustomer;
            this.customers.numberOfPax = previousOrderdNumberOfPax;
            this.customers.fectchCustomerFavouriteItem();
          } else {
            this.customers.search = "";
            this.customers.numberOfPax = "";
            this.customers.customerFavouriteItems = "";
            this.customers.newCustomerMobileNo = ""
          }

          items.forEach((item) => {
            const previousItem =
              this.previousOrderdItem &&
              this.previousOrderdItem.find(
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
          if (this.previousOrderdItem && this.previousOrderdItem.length > 0) {
            this.previousOrderdItem.forEach((previousItem) => {
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
    routeToCart(table) {
      this.addToSelectedTables(table);
      router.push("/Cart");
    },
    routeToMenu(table) {
      this.addToSelectedTables(table);
      router.push("/Menu");
    },
    async invoiceNumberFetching() {
      const tableInvoiceNumber = {
        table: this.tableName,
      };
      try {
        const result = await this.call.get(
          "ury.ury.doctype.ury_order.ury_order.get_order_invoice",
          tableInvoiceNumber
        );
        this.invoiceNumber = result.message.name;
        this.currentCaptain = result.message.waiter;
      } catch (error) {
        console.error(error._server_messages);
      }
    },
    tableTransfer: async function () {
      await this.invoiceNumberFetching();
      const transferTable = {
        table: this.tableName,
        newTable: this.newTable,
        invoice: this.invoiceNumber,
      };
      this.call
        .post(
          "ury.ury.doctype.ury_order.ury_order.table_transfer",
          transferTable
        )
        .then(() => {
          window.location.reload();
        })
        .catch((error) => {
          if (error._server_messages) {
            this.newTable = "";
            const messages = JSON.parse(error._server_messages);
            const message = JSON.parse(messages[0]);
            this.alert.createAlert("Message", message.message, "OK");
          }
        });
    },
    captianTransfer: async function () {
      await this.invoiceNumberFetching();
      if (this.invoiceNumber) {
        const transferCaptain = {
          currentCaptain: this.currentCaptain,
          newCaptain: this.newCaptain,
          invoice: this.invoiceNumber,
        };
        this.call
          .post(
            "ury.ury.doctype.ury_order.ury_order.captain_transfer",
            transferCaptain
          )
          .then(() =>
            this.notification.createNotification(
              "Captain Transferred Successfully"
            )
          )
          .then(() => window.location.reload())
          .catch((error) => {
            if (error._server_messages) {
              const messages = JSON.parse(error._server_messages);
              const message = JSON.parse(messages[0]);
              this.alert.createAlert("Message", message.message, "OK");
            }
          });
      }
    },
  },
});
