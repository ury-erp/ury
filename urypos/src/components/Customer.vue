<template>
  <orderInfo />
  <div class="container m-auto">
    <div class="mb-6 gap-6 md:grid-cols-2">
      <div class="relative mt-5 lg:mt-2" ref="container">
        <div
          class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"
        >
          <svg
            aria-hidden="true"
            class="h-5 w-5 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            ></path>
          </svg>
        </div>
        <input
          type="search"
          class="block w-full rounded-lg border border-input bg-muted p-2.5 pl-10 text-sm text-foreground focus:border-ring focus:ring-ring md:w-3/5 lg:w-2/5"
          :placeholder="$t('customer.search')"
          v-model="this.customers.search"
          @input="this.customers.handleSearchInput"
          @click="this.customers.searchCustomer()
          "
          :disabled="this.menu.selectedOrderType === 'Aggregators' || this.recentOrders.previousOrderdCustomer !== ''"
          required
        />

        <div
          v-if="
            this.customers.showCustomers && this.customers.showAddNewCustomer
          "
          class="absolute left-0 top-full z-10 max-h-64 w-full overflow-y-scroll rounded-xl bg-card shadow md:w-3/5 lg:w-2/5"
          ref="dropdown"
        >
          <div
            class="h-16 rounded-lg p-4 hover:bg-muted"
            v-for="(customer, index) in this.customers.customer"
            :key="index"
            @click="this.customers.selectCustomer(customer)"
          >
            <h1 class="text-base font-semibold leading-normal">
              {{ customer.name }}
            </h1>
            <h2 class="text-sm leading-normal">
              {{ customer.name }}
              {{
                customer.content
                  ? this.customers.extractName(customer.content)
                  : ""
              }}
            </h2>
          </div>
          <div v-if="this.customers.showAddNewCustomer">
            <div class="flex justify-end">
              <span class="sr-only">{{ $t('common.close') }}</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="mt-2 mr-2 h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                @click="this.customers.showAddNewCustomer = false"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <a
              href="#"
              class="mt-1 lg:mt-0 inline-flex items-center text-primary hover:underline"
              @click.prevent="
                this.customers.newCustomerData(this.customers.search)
              "
            >
              <svg
                fill="none"
                stroke="currentColor"
                class="h-8 w-8 font-extrabold"
                viewBox="0 0 25 25"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 6v12m6-6H6"
                ></path>
              </svg>
              {{ $t('customer.create_new') }}
            </a>
          </div>
        </div>
      </div>
      <div
        v-if="this.customers.showModalNewCustomer"
        class="fixed inset-0 z-10 mt-20 overflow-y-auto bg-muted"
      >
        <div class="mb-16 mt-10 flex items-center justify-center">
          <div class="w-full rounded-lg bg-card p-6 shadow-raised md:max-w-md">
            <div class="flex justify-end">
              <span class="sr-only">{{ $t('common.close') }}</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                @click="this.customers.showModalNewCustomer = false"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>

            <h2
              class="mt-1 block text-left text-xl font-medium text-foreground"
            >
              {{ $t('customer.new') }}
            </h2>
            <label
              for="newCustomer"
              class="mt-6 block text-left text-foreground"
            >
              {{ $t('customer.name') }}
            </label>
            <input
              type="text"
              id="newCustomer"
              class="mt-4 w-full rounded-lg border border-input bg-muted text-sm text-foreground focus:border-ring focus:ring-ring"
              v-model="this.customers.newCustomer"
            />

            <label
              for="mobileNumber"
              class="mt-6 block text-left text-foreground"
            >
              {{ $t('customer.mobile') }}
            </label>
            <input
              type="number"
              id="mobileNumber"
              class="mt-4 w-full rounded-lg border border-input bg-muted text-sm text-foreground focus:border-ring focus:ring-ring"
              v-model="this.customers.newCustomerMobileNo"
            />
            <div class="relative mt-5" ref="container">
              <label
                for="customerGroup"
                class="mt-6 block text-left text-foreground"
              >
                {{ $t('customer.group') }}
              </label>
              <input
                type="text"
                id="customerGroup"
                class="mt-4 w-full rounded-lg border border-input bg-muted text-sm text-foreground focus:border-ring focus:ring-ring"
                v-model="this.customers.customerGroup"
                @click="
                  this.customers.showCustomersGroup = true;
                  this.customers.pickCustomerGroup();
                "
                required
              />

              <div
                v-if="this.customers.showCustomersGroup"
                class="absolute left-0 top-full z-10 max-h-64 w-full overflow-y-scroll rounded-xl bg-card shadow"
                ref="dropdown"
              >
                <div
                  class="h-12 rounded-lg p-4 hover:bg-muted"
                  v-for="(group, index) in this.customers.customerGroupList"
                  :key="index"
                  @click="this.customers.selectCustomerGroup(group)"
                >
                  <h1 class="text-base font-semibold leading-normal">
                    {{ group.name }}
                  </h1>
                </div>
              </div>
            </div>
            <div class="relative mt-5" ref="container">
              <label
                for="territory"
                class="mt-6 block text-left text-foreground"
              >
                {{ $t('customer.territory') }}
              </label>
              <input
                type="text"
                id="territory"
                class="mt-4 w-full rounded-lg border border-input bg-muted text-sm text-foreground focus:border-ring focus:ring-ring"
                v-model="this.customers.customerTerritory"
                @click="
                  this.customers.showCustomersTerritory = true;
                  this.customers.pickCustomerTerritory();
                "
                required
              />

              <div
                v-if="this.customers.showCustomersTerritory"
                class="absolute left-0 top-full z-10 max-h-64 w-full overflow-y-scroll rounded-xl bg-card shadow"
                ref="dropdown"
              >
                <div
                  class="h-12 rounded-lg p-4 hover:bg-muted"
                  v-for="(territory, index) in this.customers
                    .customerTerritoryList"
                  :key="index"
                  @click="this.customers.selectCustomerTerritory(territory)"
                >
                  <h1 class="text-base font-semibold leading-normal">
                    {{ territory.name }}
                  </h1>
                </div>
              </div>
            </div>

            <div class="flex justify-end">
              <button
                @click="this.customers.addNewCustomer()"
                class="mt-8 rounded-xl bg-primary px-3 py-2 text-primary-foreground hover:bg-primary"
              >
                {{ $t('common.save') }}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="relative mb-4 mt-4">
        <div
          class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"
        >
          <svg  
          xmlns="http://www.w3.org/2000/svg"
          class="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"      
          >
          <path fill-rule="evenodd" d="M5 4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4Zm12 12V5H7v11h10Zm-5 1a1 1 0 1 0 0 2h.01a1 1 0 1 0 0-2H12Z" clip-rule="evenodd"/>
          </svg>

        </div>
        <input
          type="number"
          id="mobileNumber"
          class="block w-full rounded-lg border border-input bg-muted p-2.5 pl-10 text-sm text-foreground focus:border-ring focus:ring-ring md:w-3/5 lg:w-2/5"
          :placeholder="$t('customer.mobile')"
          readonly
          :value="this.customers.newCustomerMobileNo || this.recentOrders.mobileNumber || this.table.mobileNumber"
        />
      </div>
      <div class="relative mb-4 mt-4" v-if="!this.auth.cashier">
        <div
          class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"
        >
          <svg
            class="h-6 w-6 text-muted-foreground group-hover:text-primary"
            fill="currentColor"
            viewBox="0 0 20 20"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              fill-rule="evenodd"
              d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
              clip-rule="evenodd"
            ></path>
          </svg>
        </div>
        <input
          type="number"
          id="numberOfPax"
          class="block w-full rounded-lg border border-input bg-muted p-2.5 pl-10 text-sm text-foreground focus:border-ring focus:ring-ring md:w-3/5 lg:w-2/5"
          :placeholder="$t('cart.pax')"
          required
          v-model="this.customers.numberOfPax"
          @input="this.customers.validateInput"
        />
      </div>
      <div class="relative mt-5" ref="container" v-if="this.auth.cashier">
        <div
          class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"
        >
          <svg
            class="h-6 w-6 text-foreground group-hover:text-primary"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M15 4h3c.6 0 1 .4 1 1v15c0 .6-.4 1-1 1H6a1 1 0 0 1-1-1V5c0-.6.4-1 1-1h3m0 3h6m-3 5h3m-6 0h0m3 4h3m-6 0h0m1-13v4h4V3h-4Z"
            />
          </svg>
        </div>
        <input
          type="text"
          class="block w-full rounded-lg border border-input bg-muted p-2.5 pl-10 text-sm text-foreground focus:border-ring focus:ring-ring md:w-3/5 lg:w-2/5"
          :placeholder="$t('order.type')"
          :value="
            this.menu.selectedOrderType || this.recentOrders.pastOrderType
          "
          @click="
                this.invoiceData.editOrderType && (this.recentOrders.pastOrderType === 'Take Away' || this.recentOrders.pastOrderType === 'Delivery')
                  ? this.customers.editOrderType(this.recentOrders.pastOrderType)
                  : ''
              "
          :readonly="!(this.recentOrders.pastOrderType === 'Take Away' || this.recentOrders.pastOrderType === 'Delivery')"        
          required
        />
        <div
          v-if="
             this.invoiceData.editOrderType && this.customers.showEditOrderType
          "
          class="absolute left-0 top-full z-10 max-h-64 w-full rounded-xl bg-card shadow md:w-3/5 lg:w-2/5"
          ref="dropdown"
        >
          <div
            class="h-10 mb-4 rounded-lg p-4 hover:bg-muted"
            @click="this.customers.selecetOrderType(customers.newOrderType)"
          >
            <h2 class="text-sm leading-normal">
               {{ customers.newOrderType }}
            </h2>
          </div>
        </div>
      </div>

      <h1
        class="tex mt-5 text-lg font-medium"
        v-if="this.customers.customerFavouriteItems.length > 0"
      >
        {{ $t('menu.favourite_items') }}
      </h1>

      <div
        class="cart-item-details mt-1 grid grid-cols-2 gap-6 py-2 sm:w-full md:w-full lg:w-full lg:grid-cols-4"
        v-if="this.customers.customerFavouriteItems.length > 0"
      >
        <h3 class="text-base font-medium">{{ $t('menu.item_name') }}</h3>
        <h3 class="text-center text-base font-medium">{{ $t('menu.quantity') }}</h3>
      </div>
      <div
        v-for="(item, index) in this.customers.customerFavouriteItems"
        :key="index"
      >
        <div
          class="cart-item-details sm:min-w-none grid w-full grid-cols-2 gap-6 py-2 sm:w-full md:w-full lg:w-full lg:grid-cols-4"
        >
          <span>{{ item.item_name }}</span>

          <span class="text-center">{{ item.qty }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import orderInfo from "./orderInfo.vue";
import { useCustomerStore } from "@/stores/Customer.js";
import { useAuthStore } from "@/stores/Auth.js";
import { usetoggleRecentOrder } from "@/stores/recentOrder.js";
import { useMenuStore } from "@/stores/Menu.js";
import { useTableStore } from "@/stores/Table.js";
import { useInvoiceDataStore } from "@/stores/invoiceData.js";


export default {
  name: "Customer",
  components: {
    orderInfo,
  },
  setup() {
    const customers = useCustomerStore();
    const auth = useAuthStore();
    const recentOrders = usetoggleRecentOrder();
    const menu = useMenuStore();
    const invoiceData = useInvoiceDataStore();
    const table=useTableStore();
    return { table,customers, auth, recentOrders,menu,invoiceData };
  },
};
</script>
