<template>
  <div class="mx-auto p-6 mb-16 relative">
    <!-- Alert Modal div start-->
    <div
      v-if="showModal"
      class="fixed inset-0 z-10 overflow-y-auto modal-overlay"
      role="dialog"
      aria-modal="true"
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
                showModal = false;
                redirectToLogin();
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

    <div
      class="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      <div v-for="kot in kot" :key="kot.name">
        <div
          :class="[kot.color]"
          class="inline-block shadow-lg gap-4 p-3 rounded-2xl w-80 h-auto masonry-item"
          style="margin-top: 28px"
          v-if="!kot.showDiv && kot.production === production"
        >
          <div class="w-64">
            <div
              :class="[{ hidden: !kot.isRotated }]"
              @click="rotateCard(kot)"
              class="absolute inset-0 bg-white z-50 opacity-80 rounded-2xl flex flex-col justify-center items-center"
            >
              <button
                @click="
                  kot.type === 'Cancelled' || kot.type === 'Partially cancelled'
                    ? confirmOrder(kot)
                    : serveOrder(kot)
                "
                :class="[{ hidden: !kot.isRotated }]"
                class="py-2 px-6 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition duration-300 ease-in-out"
              >
                {{
                  kot.type === "Cancelled" || kot.type === "Partially cancelled"
                    ? "Confirm"
                    : "Serve"
                }}
              </button>
            </div>

              <!-- Card Header: Table Name and Order Number -->
              <div class="flex justify-between" @click="rotateCard(kot)">
                <div class="text-sm w-48">
                  <span
                    v-if="kot.tableortakeaway !== 'Takeaway'"
                    class="text-sm font-medium text-[#6B7280]"
                    >Table
                  </span>
                  <span class="text-gray-900 font-semibold">
                    {{ kot.tableortakeaway }}
                    <span class="text-sm font-medium text-[#6B7280]"
                      >( {{ kot.user }} )</span
                    ></span
                  ><br />
                  <span v-if="kot.is_aggregator" class="text-sm font-medium text-[#6B7280]">Aggregator</span>
                  <span v-if="kot.is_aggregator" class="text-gray-900 ml-2 font-semibold"
                    >{{ kot.customer_name }}
                  </span><br v-if="kot.is_aggregator" />
                  <span v-if="kot.is_aggregator" class="text-sm font-medium text-[#6B7280]">Aggregator ID</span>
                  <span v-if="kot.is_aggregator" class="text-gray-900 ml-2 font-semibold"
                    >{{ kot.aggregator_id }}
                  </span><br v-if="kot.is_aggregator"/>
                  <span class="text-sm font-medium text-[#6B7280]">Order</span>
                  <span class="text-gray-900 ml-2 font-semibold"
                    >{{ daily_order_number ? kot.order_no : (kot.invoice ? kot.invoice.slice(-4) : '—') }}
                    
                  </span>
                  <span
                    class="text-gray-900 ml-2 font-semibold"
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
                >
                  {{ kot.timeRemaining }}
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
                      <span class="ml-2 text-gray-900">{{
                        kotitem.item_name
                      }}<span v-show="kotitem.indicate_course" class="text-sm text-gray-500 ml-1"> ( {{kotitem.course}} )</span>
                      </span
                      ><br />
                      <span
                        class="ml-2 text-gray-900"
                        v-if="
                          kot.type === 'Partially cancelled' ||
                          kot.type === 'Cancelled'
                        "
                        >[Old Qty = {{ kotitem.quantity }}]</span
                      >
                    </div>
                    <div>
                      <span class="ml-2 text-gray-900">{{ kotitem.qty }}</span>
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

let host = window.location.hostname;
let port = window.location.port;
let protocol = window.location.protocol;
let url = port ? `${protocol}//${host}:${port}` : `${protocol}//${host}`;
window.globalSiteName = '';
let socket; 

function debounce(fn, delay) {
    let timer = null;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

async function fetchAndSetSiteName() {
    try {
        const response = await fetch('/api/method/ury.ury.api.ury_kot_display.get_site_name', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();
        window.globalSiteName = data?.message?.site_name || '';
    } catch (error) {
        if (import.meta.env?.DEV) console.error('Failed to fetch site name:', error);
    }
}

async function initializeSocket() {
    await fetchAndSetSiteName();
    if (window.globalSiteName) {
        let site = window.globalSiteName;
        let site_url = `${url}/${site}`;
        socket = io(site_url, {
          withCredentials: true,
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
        });
    } else {
        console.error('Site name is not set. Socket cannot be initialized.');
    }
}

initializeSocket(); // Initialize the socket after fetching the site name


const frappe = new FrappeApp(url);
export default {
  inject: ['authState'],
  data() {
    return {
      kot: [],
      masonry: null,
      production: "",
      branch: "",
      kot_channel: "",
      struckThroughItems: {},
      loggeduser: "",
      showModal: false,
      kot_alert_time: "",
      showAudioAlertMessage: false,
      audio_alert: 0,
      isOnline: navigator.onLine,
      statusMessage: "",
      daily_order_number:0,
      socketHandler: null
    };
  },
  methods: {
    playAlertSound(path) {
      const currentDomain = window.location.origin;
      const audio_path = currentDomain + path;
      const audio = new Audio(audio_path);
      audio.play().catch(() => {});
    },
    auth() {
      return new Promise((resolve, reject) => {
        const authApi = frappe.auth();
        authApi
          .getLoggedInUser()
          .then((user) => {
            this.loggeduser = user;
            // Update shared auth state so route guard works
            if (this.authState) {
              this.authState.isLoggedIn = true;
            }
            resolve();
          })
          .catch((error) => {
            if (import.meta.env?.DEV) console.error(error);
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
              // result processed successfully
              this.branch = result.message.Branch;
              this.kot_alert_time = result.message.kot_alert_time;
              this.audio_alert = result.message.audio_alert;
              this.daily_order_number = result.message.daily_order_number;
              this.kot_channel = `kot_update_${this.branch}_${this.production}`;
              this.kot = result.message.KOT;
              this.updateQtyColorTable();
              this.updateTimeRemaining();
              this.masonryLoading();
              resolve();
            })
            .catch((error) => {
              if (import.meta.env?.DEV) console.error(error);
              reject(error);
            });
        } catch (error) {
          reject(error);
        }
      });
    },
    rotateCard(kot) {
      this.masonryLoading();
      kot.isRotated = !kot.isRotated;
    },
    confirmOrder(kot) {
      this.call
        .post("ury.ury.api.ury_kot_display.confirm_cancel_kot", {
          name: kot.name,
          user: this.loggeduser,
        })
        .then((result) => {
          kot.showDiv = !kot.showDiv;

          this.removeAllItemsFromLocalStorage(kot);
          this.masonryLoading();
        })
        .catch((error) => {
          this.setStatusMessage("Action failed. Please try again.");
          this.hideStatusMessageAfterDelay();
        });
    },
    serveOrder(kot) {
      const currentTime = new Date().toLocaleTimeString();

      this.call
        .post("ury.ury.api.ury_kot_display.serve_kot", {
          name: kot.name,
          time: currentTime,
        })
        .then((result) => {
          kot.showDiv = !kot.showDiv;

          this.removeAllItemsFromLocalStorage(kot);
          this.masonryLoading();
        })
        .catch(() => {
          this.setStatusMessage("Action failed. Please try again.");
          this.hideStatusMessageAfterDelay();
        });
    },

    orderDelayNotify(kot) {

      this.call
        .post(
          "ury.ury.api.ury_kot_notification.order_delay_notification",
          {
            id: kot.name,
          }
        )
        .catch((error) => { if (import.meta.env?.DEV) console.error(error); });
    },
    toggleItemStrikeThrough(kotitem, kot) {
      kotitem.striked = !kotitem.striked;
      localStorage.setItem(
        `${kot.name}_${kotitem.name}_strike`,
        JSON.stringify(kotitem.striked)
      );
    },

    updateColorandTable(kot, restaurant_table, type, table_takeaway) {
      if (restaurant_table === undefined) {
        kot.tableortakeaway = "Takeaway";
      } else {
        if (table_takeaway === 1) {
          kot.tableortakeaway = "Takeaway";
        } else {
          kot.tableortakeaway = restaurant_table;
        }
      }
      if (type === "Order Modified") {
        kot.color = "bg-[#FFD493] border border-[#FFC700]";
      } else if (type === "Partially cancelled" || type === "Cancelled") {
        kot.color = "bg-[#FFD2D2] border border-[#FAA7A7]";
      } else if (restaurant_table === undefined || table_takeaway === 1) {
        kot.color = "bg-blue-100 border border-blue-200";
      } else {
        kot.color = "bg-white";
      }
    },
    updateQtyColorTable() {
      this.kot.forEach((kot) => {
        this.updateColorandTable(
          kot,
          kot.restaurant_table,
          kot.type,
          kot.table_takeaway
        );

        kot.kot_items.forEach((kotitem) => {
          const savedState = localStorage.getItem(
            `${kot.name}_${kotitem.name}_strike`
          );
          if (savedState) {
            try {
              kotitem.striked = JSON.parse(savedState);
            } catch (e) {
              kotitem.striked = false;
            }
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
      if (type === "Partially cancelled" || type === "Cancelled") {
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
      this.kot.forEach((kot) => {
        kot.timeRemaining = this.calculateTimeRemaining(kot.time);

        const timeRemaining = kot.timeRemaining.split(":");
        const minutes =
          parseInt(timeRemaining[0], 10) * 60 + parseInt(timeRemaining[1], 10);

        if (
          minutes === Number(this.kot_alert_time) &&
          kot.type !== "Cancelled" &&
          kot.type !== "Partially cancelled"
        ) {
          this.orderDelayNotify(kot);
        }
        if (minutes >= this.kot_alert_time) {
          kot.timecolor = "text-[#DC0000]";
        } else {
          kot.timecolor = "text-black";
        }
      });
    },
    calculateTimeRemaining(targetTime) {
      if (!targetTime || !targetTime.includes(":")) return '— : —';
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
      }).catch((e) => { console.error("KOT fetch failed:", e); });
    },
    redirectToLogin() {
      const currentDomain = window.location.origin;
      window.location.href =
        currentDomain + "/login?redirect-to=URYMosaic/" + this.production;
    },
    masonryLoading() {
      if (this.masonry) {
        this.masonry.destroy();
        this.masonry = null;
      }
      this.$nextTick(() => {
        if (!this.$el) return;
        const grid = this.$el.querySelector(".grid");
        if (!grid) return;
        this.masonry = new Masonry(grid, {
          itemSelector: ".masonry-item",
          gutter: 28,
        });
        this.masonry.layout();
      });
    },
    hideAudioAlertMessage() {
      this.showAudioAlertMessage = false;
    },
    handleOnline() {
      this.isOnline = true;
      this.setStatusMessage("You are online");
      this.hideStatusMessageAfterDelay();
      this.fetchKOT().then(() => {
        this.masonryLoading();
      }).catch((e) => { console.error("KOT fetch failed:", e); });
    },
    handleOffline() {
      this.isOnline = false;
      this.setStatusMessage("You are Offline");
    },
    setStatusMessage(message) {
      this.statusMessage = message;
    },
    hideStatusMessageAfterDelay() {
      this._statusTimeout = setTimeout(() => {
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
  created() {
    // API client as non-reactive instance property (avoids Proxy overhead)
    this.call = frappe.call();
  },
  mounted() {
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);
    document.addEventListener("click", this.hideAudioAlertMessage);
    const currentUrl = window.location.href;
    const parts = currentUrl.split("/");
    const production = parts[parts.length - 1];
    const decodedProduction = decodeURIComponent(production);
    this.production = decodedProduction;

    const debouncedMasonry = debounce(() => { this.masonryLoading(); }, 150);
    this._resizeHandler = debouncedMasonry;
    window.addEventListener("resize", this._resizeHandler);
    this.masonryLoading();

    if (socket) socket.on('connect_error', (err) => {
      console.error("Socket connection error:", err);
      this.setStatusMessage("Connection error. Retrying...");
    });
    if (socket) socket.on('disconnect', (reason) => {
      console.warn("Socket disconnected:", reason);
      this.setStatusMessage("Connection lost. Reconnecting...");
    });
    if (socket) socket.on('connect', () => {
      this.setStatusMessage("Reconnected");
      this.hideStatusMessageAfterDelay();
    });

    this.auth()
      .then(() => {
        this.fetchKOT().then(() => {
          if (this.audio_alert === 1) {
            this.showAudioAlertMessage = true;
          }
          this.socketHandler = (doc) => {
            try {
              if (this.audio_alert === 1) {
                this.playAlertSound(doc.audio_file);
              }
              let kottime = localStorage.getItem("kot_time");
              if (doc.last_kot_time !== kottime) {
                // Full refresh needed — skip intermediate mutations
                this.fetchKOT().then(() => { this.masonryLoading(); }).catch((e) => { console.error("KOT fetch failed:", e); });
              } else {
                // Incremental update
                const newKot = { isRotated: false, showDiv: false, timecolor: 'text-black', timeRemaining: '— : —', ...doc.kot };
                this.kot.unshift(newKot);
                this.updateQtyColorTable();
                this.updateTimeRemaining();
                this.masonryLoading();
              }
              if (this._cancelTimeout) clearTimeout(this._cancelTimeout);
              this._cancelTimeout = setTimeout(() => {
                if (doc.kot && doc.kot.type === "Cancelled") {
                  this.fetchKOT().then(() => {
                    this.masonryLoading();
                  }).catch((e) => { console.error("KOT fetch failed:", e); });
                }
              }, 1500);
              if (doc.kot) localStorage.setItem("kot_time", doc.kot.time);
            } catch (err) {
              if (import.meta.env?.DEV) console.error("Socket handler error:", err);
            }
          };
          if (socket) socket.on(this.kot_channel, this.socketHandler);
        }).catch((e) => { console.error("KOT fetch failed:", e); });
      })
      .catch((error) => {
        console.error("Authentication error:", error);
        this.showModal = true;
      });
    this.timer = setInterval(this.updateTimeRemaining, 60000);
  },
  beforeUnmount() {
    window.removeEventListener("online", this.handleOnline);
    window.removeEventListener("offline", this.handleOffline);
    document.removeEventListener("click", this.hideAudioAlertMessage);
    window.removeEventListener("resize", this._resizeHandler);
    if (this.socketHandler) {
      socket.off(this.kot_channel, this.socketHandler);
    }
    if (socket) {
      socket.off('connect_error');
      socket.off('disconnect');
      socket.off('connect');
    }
    if (this._cancelTimeout) clearTimeout(this._cancelTimeout);
    if (this._statusTimeout) clearTimeout(this._statusTimeout);
    if (this.timer) clearInterval(this.timer);
  },
  computed: {
    sortedKotItems() {
      return (kot) => {
        return [...(kot.kot_items || [])].sort((a, b) => a.serve_priority - b.serve_priority);
      };
    },
  },
};
</script>
<style scoped>
.modal-overlay {
  background-color: rgba(0, 0, 0, 0.2);
}
</style>
