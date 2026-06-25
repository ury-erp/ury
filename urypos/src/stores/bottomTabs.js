import { defineStore } from "pinia";
import { useAuthStore } from "./Auth.js";
import router from "../router";
import { useAlert } from "./Alert.js";
import { useTableStore } from "./Table.js";
import { useMenuStore } from "./Menu.js";

export const tabFunctions = defineStore("tabClick", {
  state: () => ({}),
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
      const table = useTableStore();
      const alert = useAlert();
      if (!table.selectedTable) {
        alert
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
      const auth = useAuthStore();
      const table = useTableStore();
      const alert = useAlert();
      const menu = useMenuStore();
      if (!auth.cashier && !table.selectedTable) {
        alert
          .createAlert(
            "No Active Table",
            "You have not selected an active table",
            "Ok"
          )
          .then(() => {
            router.push("/Table");
          });
      }
      if (auth.cashier && !menu.selectedOrderType) {
        alert
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
        auth.cashier &&
        menu.selectedOrderType === "Aggregators" &&
        !menu.selectedAggregator
      ) {
        alert
          .createAlert("No Aggregator", "Please select an Aggregator", "Ok")
          .then(() => {
            router.push("/Table");
          });
      }
    },
  },
});