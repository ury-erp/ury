import { defineStore } from "pinia";
import { useTableStore } from "./Table.js";
import { useMenuStore } from "./Menu.js";
import { useInvoiceDataStore } from "./invoiceData.js";
import frappe from "./frappeSdk.js";

import axios from "axios";
import { useAlert } from "./Alert.js";
import router from "../router";
import { disconnectQzPrinter } from "./utils/PrintWithQz";

axios.defaults.baseURL = frappe.url;

export const useAuthStore = defineStore("auth", {
  state: () => ({
    userId: "",
    userName: "",
    sessionUser: "",
    currentPassword: "",
    userRole: [],
    isPosOpen: true,
    hasAccess: false,
    showPassword: false,
    activeDropdown: false,
    cashierisPosOpen: false,
    cashier: null,
    viewItemImage: null,
    viewAllStatus: null,
    restrictTableOrder: null,
    removeTableOrderItem: null,
    db: frappe.db(),
    call: frappe.call(),
    auth: frappe.auth(),
    alert: useAlert(),
    menu: useMenuStore(),
    table: useTableStore(),
    invoiceData: useInvoiceDataStore(),
    userAuth: localStorage.getItem("userAuth"),
  }),
  getters: {
    isAuthenticated(state) {
      state.isAuthenticated;
    },
    passwordFieldType() {
      return this.showPassword ? "text" : "password";
    },
  },
  actions: {
    //Login
    async login() {
      try {
        await this.auth.loginWithUsernamePassword({
          username: this.userId,
          password: this.currentPassword,
          device: "mobile",
        });
        this.userAuth = true;
        localStorage.setItem("userAuth", "true");
        await this.fetchUserDetails();
      } catch (error) {
        this.alert.createAlert("Message", error.message, "OK");
      }
    },
    checkAuthState() {
      if (this.userAuth && localStorage.getItem("userAuth")) {
        this.userAuth = true;
      }
    },
    getLoginAvatar() {
      const atIndex = this.sessionUser.indexOf("@");
      if (atIndex > -1) {
        this.userName = this.sessionUser.substring(0, atIndex);
      } else {
        this.userName = "";
      }
      return this.userName;
    },
    fetchUserDetails() {
      const user = localStorage.getItem("userAuth");
      // if (user !== "true") {
      //   this.userAuth = false;
      //   localStorage.removeItem("userAuth");
      //   router.push("/login");
      //   return
      // }
      this.auth
        .getLoggedInUser()
        .then((user) => {
          this.sessionUser = user;
          if (!this.sessionUser) {
            this.userAuth = false;
            localStorage.removeItem("userAuth");
          } else {
            this.userAuth = true;
            this.invoiceData.fetchInvoiceDetails().then(() => {
              router.push("/Table");
              this.table.fetchRoom();
              this.fetchUserRole();
            });
          }
        })
        .catch((error) => {
          this.userAuth = false;
          localStorage.removeItem("userAuth", "true");
          router.push("/login");
        });
    },
    fetchUserRole() {
      //Fetching role based on logged user
      this.db
        .getDoc("User", this.sessionUser)
        .then((doc) => {
          this.userRole = doc.roles.map((item) => item.role);
          const getPosProfile = {
            doctype: "POS Profile",
            name: this.invoiceData.posProfile,
          };
          this.call
            .get("frappe.client.get", getPosProfile)
            .then((result) => {
              var billingRoles = result.message.role_allowed_for_billing.map(
                (role) => role.role
              );
              this.cashier = billingRoles.some((role) =>
                this.userRole.includes(role)
              );
              if (this.cashier) {
                this.menu.pickOrderType();
                // this.menu.fetchItems();
              }
              this.isPosOpenChecking();
              this.isPosCloseCheck();
              var transferRoles = result.message.transfer_role_permissions.map(
                (role) => role.role
              );
              this.hasAccess = transferRoles.some((role) =>
                this.userRole.includes(role)
              );
              var restrictOrder =
                result.message.role_restricted_for_table_order.map(
                  (role) => role.role
                );
              this.restrictTableOrder = restrictOrder.some((role) =>
                this.userRole.includes(role)
              );
              this.viewAllStatus = result.message.view_all_status;
              this.removeTableOrderItem = result.message.remove_items;
              this.viewItemImage = result.message.show_image;
            })
            .catch((error) => console.error(error));
        })
        .catch((error) => {
          console.error(error);
        });
    },
    routeToHome() {
      var currentDomain = window.location.protocol + "//" + window.location.hostname;
      window.location.href = currentDomain + "/app/";
    },

    isPosOpenChecking() {
      if (this.invoiceData.multipleCashier) {
        this.call
          .get("ury.ury.doctype.ury_order.ury_order.pos_opening_check")
          .then((result) => {
            var currentDomain = window.location.origin;
            if (!result.message.opening_exists) {
              this.alert.createAlert("Message", "POS Opening Entry is not created", "OK").then(() => {
                window.location.href = currentDomain + "/app/";
              });
            }

          })
          .catch((error) => {
            var currentDomain = window.location.origin;
            const serverMessages = JSON.parse(error._server_messages);
            const innerMessageString = serverMessages[0];
            const innerMessage = JSON.parse(innerMessageString);
            const message = innerMessage.message;
            this.alert.createAlert("Message", message, "OK").then(() => {
              window.location.href = currentDomain + "/app/";
            });

          });
      } 
      else {
        this.call
          .get("ury.ury_pos.api.posOpening")
          .then((result) => {
            const serverMessages = JSON.parse(result._server_messages);
            const innerMessageString = serverMessages[0];
            const innerMessage = JSON.parse(innerMessageString);
            const message = innerMessage.message;
            // if (this.cashier) {
            //   this.alert.createAlert("Message", message, "OK").then(() => {
            //     router.push("/posOpen");
            //   });
            // } else {
            var currentDomain = window.location.origin;
            this.alert.createAlert("Message", message, "OK").then(() => {
              window.location.href = currentDomain + "/app/";
            });
            // }
          })
          .catch((error) => {
            // console.error(error)
          });
      }
    },
    isPosCloseCheck() {
      const getPosProfile = {
        pos_profile: this.invoiceData.posProfile,
      };
      this.call
        .get("ury.ury_pos.api.validate_pos_close", getPosProfile)
        .then((result) => {
          if (result.message === "Failed") {
            var currentDomain = window.location.origin;
            this.alert
              .createAlert("Message", "Please close previous POS Entry", "OK")
              .then(() => {
                window.location.href = currentDomain + "/app/";
              });
          }
        })
        .catch((error) => {
          console.error(error);
        });
    },
    toggleDropdown() {
      if (this.activeDropdown) {
        this.hideDropdown();
      } else {
        this.activeDropdown = true;
      }
    },
    hideDropdown() {
      this.activeDropdown = false;
    },

    logOut() {
      this.auth
        .logout()
        .then(() => {
          router.push("/login").then(() => {
            window.location.reload();
          });
          localStorage.removeItem("userAuth", "true");
          disconnectQzPrinter();
        })
        .catch((error) => console.error(error));
    },
  },
});
