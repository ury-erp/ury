<template>
  <div class="mx-auto p-6 mb-16 relative">
    <!-- Alert Modal div start-->
    <div
      v-if="this.showModal"
      class="fixed inset-0 z-10 overflow-y-auto bg-gray-100"
    >
      <div class="flex items-center justify-center">
        <div class="w-full rounded-lg bg-white p-6 shadow-lg md:max-w-md">
          <p
            class="block text-left text-xl font-medium text-gray dark:text-gray"
          >
            <span
              class="w-3 h-3 rounded-full inline-block mr-1 bg-red-500"
            ></span>
            Not Permitted
          </p>
          <hr class="border-gray-200" />

          <p class="text-left text-xl mt-6 font-medium text-gray-500">
            Log in to access this page.
          </p>

          <div class="flex justify">
            <button
              @click="
                this.showModal = false;
                this.redirectToLogin();
              "
              class="mt-8 rounded bg-blue-500 px-3 py-2 text-white hover:bg-blue-600"
            >
              Login
            </button>
          </div>
        </div>
      </div>
    </div>
    <!-- Alert Modal div end-->

    <div v-if="actionError" role="alert" class="mb-4 rounded-lg bg-red-50 border border-red-500 p-4 text-red-700">
      {{ actionError }}
    </div>

    <div v-if="branch" class="mb-4">
      <button @click="fetchRecentServed" :disabled="loadingServed" class="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50">
        {{ loadingServed ? "Loading…" : "Recently served · Recall" }}
      </button>
      <div v-if="showRecentServed" class="mt-3 rounded-lg border p-3">
        <p class="mb-2 text-gray-500">Recall is available for 15 minutes after serving.</p>
        <p v-if="!recentServed.length && !loadingServed" class="text-gray-500">No recently served tickets.</p>
        <div v-for="served in recentServed" :key="served.name" class="flex justify-between items-center py-2">
          <span>{{ served.table_takeaway || !served.restaurant_table ? "Takeaway" : served.restaurant_table }} · {{ daily_order_number ? served.order_no : served.invoice.slice(-4) }}</span>
          <button @click="recallOrder(served)" :disabled="recalling[served.name]" class="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50">
            {{ recalling[served.name] ? "Recalling…" : "Recall" }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="kot.filter(k => k.production === production).length === 0 && !loadingKots" class="text-center py-10 text-gray-500 text-xl">
      No active orders for {{ production }}
    </div>

    <div
      class="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      <div v-for="kot in this.kot" :key="kot.name">
        <div
          :class="[kot.color, { 'ring-4 ring-red-600': kot.late }]"
          class="inline-block shadow-lg gap-4 p-3 rounded-2xl w-90 h-auto masonry-item"
          style="margin-top: 28px"
          v-if="!kot.showDiv && kot.production === production"
        >
          <div class="w-64 check">
            <div
              :class="[{ hidden: !kot.isRotated }]"
              @click="rotateCard(kot)"
              class="absolute inset-0 bg-white z-50 opacity-80 rounded-2xl flex flex-col justify-center items-center"
            >
              <button
                @click.stop="
                  kot.type === 'Cancelled' || kot.type === 'Partially cancelled'
                    ? confirmOrder(kot)
                    : serveOrder(kot)
                "
                :class="[{ hidden: !kot.isRotated }]"
                :disabled="!!pendingServes[kot.name] || !!confirming[kot.name]"
                class="py-2 px-6 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition duration-300 ease-in-out"
              >
                {{
                  kot.type === "Cancelled" || kot.type === "Partially cancelled"
                    ? "Confirm"
                    : "Serve"
                }}
              </button>
            </div>

            
              <!-- Serve Button -->

              <!-- Card Header: Table Name and Order Number -->
              <div class="flex justify-between" @click="rotateCard(kot)">
                <div class="text-sm w-48">
                  <span
                    v-if="kot.tableortakeaway !== 'Takeaway'"
                    class="text-sm font-medium text-[#6B7280]"
                    >Table
                  </span>
                  <span class="text-black-500 font-semibold">
                    {{ kot.tableortakeaway }}
                    <span class="text-sm font-medium text-[#6B7280]"
                      >( {{ kot.user }} )</span
                    ></span
                  ><br />
                  <span v-if="kot.is_aggregator" class="text-sm font-medium text-[#6B7280]">Aggregator</span>
                  <span v-if="kot.is_aggregator" class="text-black-500 ml-2 font-semibold"
                    >{{ kot.customer_name }}
                  </span><br v-if="kot.is_aggregator" />
                  <span v-if="kot.is_aggregator" class="text-sm font-medium text-[#6B7280]">Aggregator ID</span>
                  <span v-if="kot.is_aggregator" class="text-black-500 ml-2 font-semibold"
                    >{{ kot.aggregator_id }}
                  </span><br v-if="kot.is_aggregator"/>
                  <span class="text-sm font-medium text-[#6B7280]">Order</span>
                  <span class="text-black-500 ml-2 font-semibold"
                    >{{ this.daily_order_number ? kot.order_no : kot.invoice.slice(-4) }}
                    
                  </span>
                  <span
                    class="text-black-500 ml-2 font-semibold"
                    v-if="
                      kot.type === 'Partially cancelled' ||
                      kot.type === 'Cancelled'
                    "
                  >
                    ( {{ kot.type }} )</span
                  >
                </div>
                <div
                  :class="kot.timecolor"
                  class="font-inter font-semibold text-2xl leading-10"
                >
                  {{ kot.timeRemaining }}
                  <span v-if="kot.late" class="block text-sm text-red-700 leading-4">LATE</span>
                </div>
              </div>
              <div
                v-if="kot.type === 'Duplicate'"
                class="text-[#DC0000] font-medium"
              >
                ( Duplicate KOT ( CHECK WITH CAPTAIN ) )
              </div>
              <div v-show="kot.comments" class="text-[#6B7280] font-medium">
                ( {{ kot.comments }} )
              </div>
              <div></div>
              <div>
                <div
                  class="font-semibold justify-between items-center mt-2"
                  v-for="kotitem in sortedKotItems(kot)"
                  :key="kotitem.name"
                >
                  <div
                    @click="
                      () => {
                        toggleItemStrikeThrough(kotitem, kot);
                      }
                    "
                    :class="{
                      'line-through text-green-700': kotitem.striked,
                    }"
                    class="flex font-semibold justify-between items-center"
                  >
                    <div>
                      <span class="ml-2 text-black-100">{{
                        kotitem.item_name
                      }}<span v-show="kotitem.indicate_course" class="text-sm text-gray-500 ml-1"> ( {{kotitem.course}} )</span>
                      </span
                      ><br />
                      <span
                        class="ml-2 text-black-100"
                        v-if="
                          kot.type === 'Partially cancelled' ||
                          kot.type === 'Cancelled'
                        "
                        >[Old Qty = {{ kotitem.quantity }}]</span
                      >
                    </div>
                    <div>
                      <span class="ml-2 text-black-100">{{ kotitem.qty }}</span>
                    </div>
                  </div>
                  <div>
                    <p
                      v-show="kotitem.comments"
                      class="ml-2 text-[#6B7280] font-medium"
                    >
                      {{ kotitem.comments }}
                    </p>
                    <hr class="my-1 border-gray-200 mt-2" />
                  </div>
                </div>
              </div>
            
          </div>
          <div v-if="pendingServes[kot.name]" class="mt-3 flex justify-between items-center text-blue-700">
            <span>{{ pendingServes[kot.name].sending ? "Serving…" : "Serving in 5 seconds…" }}</span>
            <button v-if="!pendingServes[kot.name].sending" @click.stop="undoServe(kot)" class="rounded border border-blue-600 px-3 py-1 font-semibold">Undo</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Audio Alert Message -->
    <div
      v-if="showAudioAlertMessage"
      class="absolute top-1 left-1/2 transform -translate-x-1/2 p-2 font-bold text-2xl text-red-500 text-center"
    >
      Audio notifications disabled. Click anywhere to enable.
    </div>

    <!-- KOT Delay Error Alert Banner -->
    <div
      v-if="showKotErrorAlert && kotErrorAlert"
      class="fixed top-0 left-0 right-0 mx-auto p-4 bg-red-50 border-b-4 border-red-500 shadow-lg z-40 flex justify-between items-center"
    >
      <div class="flex items-center gap-3">
        <div class="flex-shrink-0">
          <span class="text-3xl">⚠️</span>
        </div>
        <div class="flex-1">
          <p class="font-bold text-red-700">Order Delayed</p>
          <p class="text-red-600 text-sm mt-1">
            <span v-if="!daily_order_number">Invoice: {{ kotErrorAlert.invoice.slice(-4) }}</span>
            <span v-else>Order #: {{ kotErrorAlert.order_no }}</span>
            | Table: {{ kotErrorAlert.tableortakeaway }} | Time: {{ kotErrorAlert.timestamp }}
          </p>
        </div>
      </div>
      <button
        @click="hideKotErrorAlert"
        class="ml-4 text-red-700 hover:text-red-900 font-bold text-xl flex-shrink-0"
      >
        ✕
      </button>
    </div>

    <div
      v-if="statusMessage"
      :class="[
        'fixed',
        'bottom-10',
        'right-10',
        'p-4',
        'rounded',
        'text-white',
        {
          'bg-green-500': isOnline,
          'bg-red-500': !isOnline,
        },
      ]"
      @transitionend="handleTransitionEnd"
    >
      {{ statusMessage }}
    </div>
  </div>
</template>

<script>
import { FrappeApp } from "frappe-js-sdk";
import Masonry from "masonry-layout";
import io from "socket.io-client";
import { canRecallKot, isKotLate, kitchenErrorMessage, recentServedQuery } from "./kitchen-actions.js";

let host = window.location.hostname;
let port = window.location.port;
let protocol = window.location.protocol;
let url = port ? `${protocol}//${host}:${port}` : `${protocol}//${host}`;
window.globalSiteName = '';
let socket; 

async function fetchAndSetSiteName() {
    try {
        const response = await fetch('/api/method/ury.ury.api.ury_kot_display.get_site_name', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();
        window.globalSiteName = data.message.site_name;
        // console.log('Global Site Name:', window.globalSiteName);
    } catch (error) {
        console.error('Failed to fetch site name:', error);
    }
}

async function initializeSocket() {
    await fetchAndSetSiteName();
    if (window.globalSiteName) {
        let site = window.globalSiteName;
        let site_url = `${url}/${site}`;
        socket = io(site_url,{ withCredentials: true });
        console.log("socket == >",socket)
        socket.on('connect_error', (err) => {
            console.error("Socket connection error:", err);
        }); 
        socket.on('connect', () => {
            console.log('Socket connected:', socket.connected);
        });
    } else {
        console.error('Site name is not set. Socket cannot be initialized.');
    }
}

initializeSocket(); // Initialize the socket after fetching the site name


const frappe = new FrappeApp(url);
export default {
  // inject: ["$auth", "$socket"],
  props: ["production"],
  data() {
    return {
      kot: [],
      masonry: null,
      call: frappe.call(),
      branch: "",
      kot_channel: "",
      kot_error_channel: "",
      clickedItems: new Set(),
      struckThroughItems: {},
      loggeduser: "",
      showModal: false,
      kot_alert_time: "",
      showAudioAlertMessage: false,
      audio_alert: 0,
      isOnline: navigator.onLine,
      statusMessage: "",
      daily_order_number:0,
      loadingKots: true,
      kotErrorAlert: null,
      showKotErrorAlert: false,
      actionError: "",
      pendingServes: {},
      confirming: {},
      recalling: {},
      recentServed: [],
      showRecentServed: false,
      loadingServed: false,
      serverTimeOffset: 0,
      timeInterval: null,
    };
  },
  methods: {
    playAlertSound(path) {
      var currentDomain = window.location.origin;
      var audio_path = currentDomain + path;
      const audio = new Audio(audio_path);
      audio.play();
    },
    auth() {
      return new Promise((resolve, reject) => {
        const auth = frappe.auth();
        auth
          .getLoggedInUser()
          .then((user) => {
            this.loggeduser = user;
            resolve();
          })
          .catch((error) => {
            console.error(error);
            reject(error);
          });
      });
    },
    fetchKOT() {
      return new Promise((resolve, reject) => {
        try {
          this.call
            .get("ury.ury.api.ury_kot_display.kot_list", {})
            .then((result) => {
              console.log(result,"..............result")
              this.branch = result.message.Branch;
              this.serverTimeOffset = new Date(result.message.server_time.replace(" ", "T")).getTime() - Date.now();
              this.kot_alert_time = result.message.kot_alert_time;
              this.audio_alert = result.message.audio_alert;
              this.daily_order_number = result.message.daily_order_number;
              this.kot_channel = `kot_update_${this.branch}_${this.production}`;
              this.kot_error_channel = `kot_error_${this.branch}_${this.production}`;
              this.kot = result.message.KOT;
              this.loadingKots = false;
              this.updateQtyColorTable();
              this.updateTimeRemaining();
              this.masonryLoading();
              resolve();
            })
            .catch((error) => {
              console.error(error);
              this.loadingKots = false;
              reject(error);
            });
        } catch (error) {
          this.loadingKots = false;
          reject(error);
        }
      });
    },
    rotateCard(kot) {
      this.masonryLoading();
      kot.isRotated = !kot.isRotated;
    },
    async confirmOrder(kot) {
      if (this.confirming[kot.name]) return;
      this.confirming[kot.name] = true;
      this.actionError = "";
      try {
        await this.call.post("ury.ury.api.ury_kot_display.confirm_cancel_kot", {
          name: kot.name,
        });
        this.kot = this.kot.filter(card => card.name !== kot.name);
        this.removeAllItemsFromLocalStorage(kot);
      } catch (error) {
        this.actionError = kitchenErrorMessage(error, `Could not confirm ${kot.name}. Please try again.`);
      } finally {
        delete this.confirming[kot.name];
        this.masonryLoading();
      }
    },
    serveOrder(kot) {
      if (this.pendingServes[kot.name]) return;
      this.actionError = "";
      kot.isRotated = false;
      const pending = { timer: null, sending: false };
      this.pendingServes[kot.name] = pending;
      pending.timer = setTimeout(async () => {
        pending.sending = true;
        try {
          await this.call.post("ury.ury.api.ury_kot_display.serve_kot", { name: kot.name });
          this.kot = this.kot.filter(card => card.name !== kot.name);
          this.removeAllItemsFromLocalStorage(kot);
          if (this.showRecentServed) await this.fetchRecentServed();
        } catch (error) {
          this.actionError = kitchenErrorMessage(error, `Could not serve ${kot.name}. Please try again.`);
        } finally {
          delete this.pendingServes[kot.name];
          this.masonryLoading();
        }
      }, 5000);
      this.masonryLoading();
    },
    undoServe(kot) {
      const pending = this.pendingServes[kot.name];
      if (!pending || pending.sending) return;
      clearTimeout(pending.timer);
      delete this.pendingServes[kot.name];
      this.masonryLoading();
    },
    cancelPendingServes() {
      Object.values(this.pendingServes).forEach(pending => {
        if (!pending.sending) clearTimeout(pending.timer);
      });
    },
    async fetchRecentServed() {
      if (this.loadingServed) return;
      this.loadingServed = true;
      this.showRecentServed = true;
      this.actionError = "";
      try {
        const now = new Date(Date.now() + this.serverTimeOffset);
        const result = await this.call.get("frappe.client.get_list", recentServedQuery(this.branch, this.production, now));
        this.recentServed = result.message.filter(kot => canRecallKot(kot, now));
      } catch (error) {
        this.actionError = kitchenErrorMessage(error, "Could not load recently served tickets. Please try again.");
      } finally {
        this.loadingServed = false;
      }
    },
    async recallOrder(kot) {
      if (this.recalling[kot.name]) return;
      this.recalling[kot.name] = true;
      this.actionError = "";
      try {
        await this.call.post("ury.ury.api.ury_kot_display.recall_kot", { name: kot.name });
        this.recentServed = this.recentServed.filter(card => card.name !== kot.name);
        await this.fetchKOT();
      } catch (error) {
        this.actionError = kitchenErrorMessage(error, `Could not recall ${kot.name}. Please try again.`);
      } finally {
        delete this.recalling[kot.name];
      }
    },

    async orderDelayNotify(kot) {
      const now = new Date();
      this.currentTime = now.toLocaleTimeString();

      this.call
        .post(
          "ury.ury.api.ury_kot_notification.order_delay_notification",
          {
            id: kot.name,
          }
        )
        .then((result) => {
          // console.log("call backed ", result);
        })
        .catch((error) => console.error(error));
    },
    toggleItemStrikeThrough(kotitem, kot) {
      kotitem.striked = !kotitem.striked;
      localStorage.setItem(
        `${kot.name}_${kotitem.name}_strike`,
        JSON.stringify(kotitem.striked)
      );
    },

    updateColorandTable(kot, restaurant_table, type, table_takeaway, custom_merged_tables) {
      if (restaurant_table === undefined) {
        kot.tableortakeaway = "Takeaway";
      } else {
        if (table_takeaway == 1) {
          kot.tableortakeaway = "Takeaway";
        } else {
          let label = restaurant_table;
          if (custom_merged_tables) {
            const partners = custom_merged_tables
              .split(",")
              .map((name) => name.trim())
              .filter(Boolean);
            if (partners.length) {
              label = [restaurant_table, ...partners].join(" + ");
            }
          }
          kot.tableortakeaway = label;
        }
      }
      if (type == "Order Modified") {
        kot.color = "bg-[#FFD493] border border-[#FFC700]";
      } else if (type == "Partially cancelled" || type == "Cancelled") {
        kot.color = "bg-[#FFD2D2] border border-[#FAA7A7]";
      } else if (restaurant_table === undefined || table_takeaway == 1) {
        kot.color = "bg-blue-100 border border-blue-200";
      } else {
        kot.color = "bg-white";
      }
      console.log(type,".............type")
    },
    updateQtyColorTable() {
      this.kot.forEach((kot) => {
        console.log(kot,"kot............")
        this.updateColorandTable(
          kot,
          kot.restaurant_table,
          kot.type,
          kot.table_takeaway,
          kot.custom_merged_tables
        );

        kot.kot_items.forEach((kotitem) => {
          const savedState = localStorage.getItem(
            `${kot.name}_${kotitem.name}_strike`
          );
          if (savedState) {
            kotitem.striked = JSON.parse(savedState);
          }
          this.calculateQty(
            kotitem,
            kotitem.quantity,
            kot.type,
            kotitem.cancelled_qty
          );
        });
      });
    },
    calculateQty(kotitem, qty, type, cancelled_qty) {
      kotitem.qty = qty;
      if (type == "Partially cancelled" || type == "Cancelled") {
        kotitem.qty = qty - cancelled_qty;
      }
    },
    removeAllItemsFromLocalStorage(kot) {
      // Get all keys in local storage
      const keys = Object.keys(localStorage);
      // Remove keys that start with `${kot.name}_`
      keys.forEach((key) => {
        if (key.startsWith(`${kot.name}_`)) {
          localStorage.removeItem(key);
        }
      });
    },

    updateTimeRemaining() {
      // console.log("update time", this.kot_channel);
      this.kot.forEach((kot) => {
        kot.timeRemaining = this.calculateTimeRemaining(kot.time);

        const timeRemaining = kot.timeRemaining.split(":");
        const minutes =
          parseInt(timeRemaining[0]) * 60 + parseInt(timeRemaining[1]);

        if (
          minutes === this.kot_alert_time &&
          kot.type !== "Cancelled" &&
          kot.type !== "Partially cancelled"
        ) {
          this.orderDelayNotify(kot);
        }
        kot.late = isKotLate(minutes, this.kot_alert_time);
        if (kot.late) {
          kot.timecolor = "text-[#DC0000]";
        } else {
          kot.timecolor = "text-black";
        }
      });
    },
    calculateTimeRemaining(targetTime) {
      const currentTime = new Date();
      const [targetHours, targetMinutes, targetSeconds] = targetTime.split(":");
      const targetDate = new Date(
        currentTime.getFullYear(),
        currentTime.getMonth(),
        currentTime.getDate(),
        targetHours,
        targetMinutes,
        targetSeconds
      );

      const timeDifference = currentTime - targetDate;
      const hoursRemaining = Math.floor(timeDifference / 3600000);
      const minutesRemaining = Math.floor((timeDifference % 3600000) / 60000);

      return `${hoursRemaining} : ${minutesRemaining}`;
    },
    fetchkotwithmasonry() {
      return this.fetchKOT().then(() => {
        this.masonryLoading();
      });
    },
    redirectToLogin() {
      var currentDomain = window.location.origin;
      window.location.href =
        currentDomain + "/login?redirect-to=mosaic/" + this.production;
    },
    masonryLoading() {
      this.$nextTick(() => {
        this.masonry = new Masonry(this.$el.querySelector(".grid"), {
          itemSelector: ".masonry-item",
          gutter: 28,

          // Other Masonry options can be added here
        });
        this.masonry.layout();
      });
    },
    hideAudioAlertMessage() {
      this.showAudioAlertMessage = false;
    },
    hideKotErrorAlert() {
      this.showKotErrorAlert = false;
      this.kotErrorAlert = null;
    },
    handleOnline() {
      this.isOnline = true;
      this.setStatusMessage("You are online");
      this.hideStatusMessageAfterDelay();
      this.fetchKOT().then(() => {
        this.masonryLoading();
      });
    },
    handleOffline() {
      this.isOnline = false;
      this.setStatusMessage("You are Offline");
    },
    setStatusMessage(message) {
      this.statusMessage = message;
    },
    hideStatusMessageAfterDelay() {
      setTimeout(() => {
        this.statusMessage = "";
      }, 3000);
    },
    handleTransitionEnd() {
      if (!this.isOnline) {
        // Reset the status message after transition end
        this.setStatusMessage("");
      }
    },
  },
  mounted() {
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);
    document.addEventListener("click", this.hideAudioAlertMessage);
    const self = this;
    window.addEventListener("resize", this.masonryLoading);
    this.masonryLoading();

    this.auth()
      .then(() => {
        self.fetchKOT().then(() => {
          if (this.audio_alert === 1) {
            this.showAudioAlertMessage = true;
          }
          socket.on(this.kot_channel, (doc) => {
            if (this.audio_alert === 1) {
              this.playAlertSound(doc.audio_file);
            }
            let kottime = localStorage.getItem("kot_time");
            if (doc.last_kot_time !== null) {
              if (doc.last_kot_time !== kottime) {
                this.fetchKOT().then(() => {
                  this.masonryLoading();
                });
              }
            }
            this.kot.unshift(doc.kot);
            this.masonryLoading();
            this.updateQtyColorTable();
            this.updateTimeRemaining();
            setTimeout(()=>{
              if (doc.kot.type === "Cancelled"){
                this.fetchKOT().then(() => {
                  this.masonryLoading();
                });
              }
            },1500)
            localStorage.setItem("kot_time", doc.kot.time);
          });

          // New socket listener for KOT error alerts (delayed orders)
          socket.on(this.kot_error_channel, (doc) => {
            // Look up the matching KOT in the local array to get table/order info
            const matchingKot = this.kot.find(k => k.name === doc.kot);

            this.kotErrorAlert = {
              invoice: doc.invoice,
              tableortakeaway: matchingKot?.tableortakeaway || 'Table/Takeaway info unavailable',
              order_no: matchingKot?.order_no || 'N/A',
              timestamp: new Date().toLocaleTimeString()
            };
            this.showKotErrorAlert = true;
            // Auto-hide after 8 seconds
            setTimeout(() => {
              this.hideKotErrorAlert();
            }, 8000);
          });
        });
      })
      .catch((error) => {
        console.error("Authentication error:", error);
        this.showModal = true;
      });
    this.timeInterval = setInterval(this.updateTimeRemaining, 60000);
  },
  beforeUnmount() {
    this.cancelPendingServes();
    clearInterval(this.timeInterval);
    window.removeEventListener("resize", this.masonryLoading);
    window.removeEventListener("online", this.handleOnline);
    window.removeEventListener("offline", this.handleOffline);
    document.removeEventListener("click", this.hideAudioAlertMessage);
  },
  computed: {
    sortedKotItems() {
      return (kot) => {
        return kot.kot_items.sort((a, b) => a.serve_priority - b.serve_priority);
      };
    },
  },
};
</script>
<style>
.bg-gray-100 {
  background-color: rgba(0, 0, 0, 0.2);
}
</style>
