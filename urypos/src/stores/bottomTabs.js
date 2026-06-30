import { defineStore } from "pinia";
import { useAuthStore } from "./Auth.js";
import router from "../router";
import { useAlert } from "./Alert.js";
import { useTableStore } from "./Table.js";
import { useMenuStore } from "./Menu.js";

export const tabFunctions = defineStore("tabClick", {
  state: () => ({
    auth: useAuthStore(),
    alert: useAlert(),
    menu: useMenuStore(),
    table: useTableStore(),
  }),
  getters: {
    isLoginPage() {
      return router.currentRoute.value.path === "/login";
    },
    currentTab() {
      return router.currentRoute.value.path;
    },
  },
  actions: {
    checkActiveTable() {
      if (!this.table.selectedTable) {
        this.alert
          .createAlert(
            "No Active Table",
            "You have not selected an active table",
            "Ok"
          )
          .then(() => {
            router.push("/Table");
          });
      }
    },
    clickMenuTab() {
      if (!this.auth.cashier && !this.table.selectedTable) {
        this.alert
          .createAlert(
            "No Active Table",
            "You have not selected an active table",
            "Ok"
          )
          .then(() => {
            router.push("/Table");
          });
      }
      if (this.auth.cashier && !this.menu.selectedOrderType) {
        this.alert
          .createAlert(
            "No Order Type",
            "Please select an Order Type",
            "Ok"
          )
          .then(() => {
            router.push("/Table");
          });
      }
      if (
        this.auth.cashier &&
        this.menu.selectedOrderType === "Aggregators" &&
        !this.menu.selectedAggregator
      ) {
        this.alert
          .createAlert("No Aggregator", "Please select an Aggregator", "Ok")
          .then(() => {
            router.push("/Table");
          });
      }
    },
  },
});
