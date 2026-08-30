<template>
  <div class="mx-auto p-6 mb-16 relative" style="font-family: var(--s)">
    <!-- Alert Modal div start-->
    <div
      v-if="this.showModal"
      class="fixed inset-0 z-10 overflow-y-auto"
      style="background: rgba(13, 13, 15, 0.2)"
    >
      <div class="flex items-center justify-center">
        <div class="w-full rounded-lg p-6 md:max-w-md" style="background: var(--panel); border: 1px solid var(--hair); box-shadow: 0 8px 30px rgba(0,0,0,.12)">
          <p
            class="block text-left text-xl font-medium"
            style="color: var(--t1)"
          >
            <span
              class="w-3 h-3 rounded-full inline-block mr-1"
              style="background: var(--rd)"
            ></span>
            Not Permitted
          </p>
          <hr style="border-color: var(--hair)" />

          <p class="text-left text-xl mt-6 font-medium" style="color: var(--t2)">
            Log in to access this page.
          </p>

          <div class="flex justify">
            <button
              @click="
                this.showModal = false;
                this.redirectToLogin();
              "
              class="mt-8 rounded px-3 py-2"
              style="background: var(--ac); color: #fff"
            >
              Login
            </button>
          </div>
        </div>
      </div>
    </div>
    <!-- Alert Modal div end-->

    <div v-if="kot.filter(k => k.production === production).length === 0 && !loadingKots" class="text-center py-10 text-xl" style="color: var(--t3)">
      No active orders for {{ production }}
    </div>

    <div
      class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      <div v-for="kot in this.kot" :key="kot.name">
        <div
          :class="[kot.color]"
          class="inline-block gap-4 p-3 rounded-lg border w-90 h-auto masonry-item"
          style="margin-top: 28px; border-color: var(--hair2)"
          v-if="!kot.showDiv && kot.production === production"
        >
          <div class="w-64 check">
            <div
              :class="[{ hidden: !kot.isRotated }]"
              @click="rotateCard(kot)"
              class="absolute inset-0 z-50 opacity-90 rounded-lg flex flex-col justify-center items-center"
              style="background: var(--panel)"
            >
              <button
                @click="
                  kot.type === 'Cancelled' || kot.type === 'Partially cancelled'
                    ? confirmOrder(kot)
                    : serveOrder(kot)
                "
                :class="[{ hidden: !kot.isRotated }]"
                class="py-2 px-6 rounded-md transition duration-300 ease-in-out"
                style="background: var(--ac); color: #fff; font-family: var(--s); font-size: 12.5px; font-weight: 550"
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
                <div class="text-sm w-48" style="font-family: var(--s)">
                  <span
                    v-if="kot.tableortakeaway !== 'Takeaway'"
                    class="text-sm font-medium"
                    style="color: var(--t2)"
                    >Table
                  </span>
                  <span class="font-semibold" style="color: var(--t1)">
                    {{ kot.tableortakeaway }}
                    <span class="text-sm font-medium" style="color: var(--t2)"
                      >( {{ kot.user }} )</span
                    ></span
                  ><br />
                  <span v-if="kot.is_aggregator" class="text-sm font-medium" style="color: var(--t2)">Aggregator</span>
                  <span v-if="kot.is_aggregator" class="ml-2 font-semibold" style="color: var(--t1)"
                    >{{ kot.customer_name }}
                  </span><br v-if="kot.is_aggregator" />
                  <span v-if="kot.is_aggregator" class="text-sm font-medium" style="color: var(--t2)">Aggregator ID</span>
                  <span v-if="kot.is_aggregator" class="ml-2 font-semibold" style="color: var(--t1)"
                    >{{ kot.aggregator_id }}
                  </span><br v-if="kot.is_aggregator"/>
                  <span class="text-sm font-medium" style="color: var(--t2)">Order</span>
                  <span class="ml-2 font-semibold" style="color: var(--t1); font-family: var(--m)"
                    >{{ this.daily_order_number ? kot.order_no : kot.invoice.slice(-4) }}

                  </span>
                  <span
                    class="ml-2 font-semibold"
                    style="color: var(--t1)"
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
                  class="font-semibold text-2xl leading-10"
                  style="font-family: var(--m); font-variant-numeric: tabular-nums"
                >
                  {{ kot.timeRemaining }}
                </div>
              </div>
              <div
                v-if="kot.type === 'Duplicate'"
                class="font-medium"
                style="color: var(--rd); font-family: var(--s)"
              >
                ( Duplicate KOT ( CHECK WITH CAPTAIN ) )
              </div>
              <div v-show="kot.comments" class="font-medium" style="color: var(--t2); font-family: var(--s)">
                ( {{ kot.comments }} )
              </div>
              <div></div>
              <div>
                <div
                  class="font-semibold justify-between items-center mt-2"
                  v-for="kotitem in sortedKotItems(kot)"
                  :key="kotitem.name"
                  style="font-family: var(--s); font-size: 12.5px"
                >
                  <div
                    @click="
                      () => {
                        toggleItemStrikeThrough(kotitem, kot);
                      }
                    "
                    :class="{
                      'line-through': kotitem.striked,
                    }"
                    :style="{ color: kotitem.striked ? 'var(--gr)' : 'var(--t1)' }"
                    class="flex font-semibold justify-between items-center"
                  >
                    <div>
                      <span class="ml-2">{{
                        kotitem.item_name
                      }}<span v-show="kotitem.indicate_course" class="text-sm ml-1" style="color: var(--t3)"> ( {{kotitem.course}} )</span>
                      </span
                      ><br />
                      <span
                        class="ml-2"
                        v-if="
                          kot.type === 'Partially cancelled' ||
                          kot.type === 'Cancelled'
                        "
                        >[Old Qty = {{ kotitem.quantity }}]</span
                      >
                    </div>
                    <div>
                      <span class="ml-2" style="font-family: var(--m); font-variant-numeric: tabular-nums">{{ kotitem.qty }}</span>
                    </div>
                  </div>
                  <div>
                    <p
                      v-show="kotitem.comments"
                      class="ml-2 font-medium"
                      style="color: var(--t2)"
                    >
                      {{ kotitem.comments }}
                    </p>
                    <hr class="my-1 mt-2" style="border-color: var(--hair)" />
                  </div>
                </div>
              </div>
            
          </div>
          <!-- You can add more item/quantity pairs here as needed -->
        </div>
      </div>
    </div>

    <!-- Audio Alert Message -->
    <div
      v-if="showAudioAlertMessage"
      class="absolute top-1 left-1/2 transform -translate-x-1/2 p-2 font-bold text-2xl text-center"
      style="color: var(--rd)"
    >
      Audio notifications disabled. Click anywhere to enable.
    </div>

    <!-- KOT Delay Error Alert Banner -->
    <div
      v-if="showKotErrorAlert && kotErrorAlert"
      class="fixed top-0 left-0 right-0 mx-auto p-4 z-40 flex justify-between items-center"
      style="background: var(--rd-t); border-bottom: 3px solid var(--rd)"
    >
      <div class="flex items-center gap-3">
        <div class="flex-shrink-0">
          <span class="text-3xl">⚠️</span>
        </div>
        <div class="flex-1">
          <p class="font-bold" style="color: var(--rd)">Order Delayed</p>
          <p class="text-sm mt-1" style="color: var(--rd)">
            <span v-if="!daily_order_number">Invoice: {{ kotErrorAlert.invoice.slice(-4) }}</span>
            <span v-else>Order #: {{ kotErrorAlert.order_no }}</span>
            | Table: {{ kotErrorAlert.tableortakeaway }} | Time: {{ kotErrorAlert.timestamp }}
          </p>
        </div>
      </div>
      <button
        @click="hideKotErrorAlert"
        class="ml-4 font-bold text-xl flex-shrink-0"
        style="color: var(--rd)"
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
          'bg-[var(--gr)]': isOnline,
          'bg-[var(--rd)]': !isOnline,
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
      showKotErrorAlert: false
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
    confirmOrder(kot) {
      const now = new Date();
      this.currentTime = now.toLocaleTimeString();
      this.call
        .post("ury.ury.api.ury_kot_display.confirm_cancel_kot", {
          name: kot.name,
        })
        .then((result) => {
          // kot.isHidden = !kot.isHidden;
          kot.showDiv = !kot.showDiv;
          // this.showDiv = false;

          this.removeAllItemsFromLocalStorage(kot);
          this.masonryLoading();
        })
        .catch((error) => console.error(error));
    },
    async serveOrder(kot) {
      const now = new Date();
      this.currentTime = now.toLocaleTimeString();

      this.call
        .post("ury.ury.api.ury_kot_display.serve_kot", {
          name: kot.name,
          time: this.currentTime,
        })
        .then((result) => {
          // kot.isHidden = !kot.isHidden;
          kot.showDiv = !kot.showDiv;
          // this.showDiv = false;

          this.removeAllItemsFromLocalStorage(kot);
          this.masonryLoading();
        })
        .catch((error) => console.error(error));
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
        kot.color = "bg-[var(--am-t)] border-[var(--am-b)]";
      } else if (type == "Partially cancelled" || type == "Cancelled") {
        kot.color = "bg-[var(--rd-t)] border-[var(--rd-b)]";
      } else if (restaurant_table === undefined || table_takeaway == 1) {
        kot.color = "bg-[var(--ac-t)] border-[var(--ac-b)]";
      } else {
        kot.color = "bg-[var(--panel)]";
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
        if (minutes >= this.kot_alert_time) {
          kot.timecolor = "text-[var(--rd)]";
        } else {
          kot.timecolor = "text-[var(--t1)]";
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
    setInterval(this.updateTimeRemaining, 60000);
  },
  beforeDestroy() {
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

