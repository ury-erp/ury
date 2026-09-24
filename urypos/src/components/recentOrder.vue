<template>
  <div class="mt-3 flex flex-col md:flex-row">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-border bg-opacity-50 text-lg"
      v-if="this.invoiceData.isPrinting"
    >
      {{ $t('order.printing_invoice') }}
    </div>

    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-border bg-opacity-50 text-lg"
      v-if="this.recentOrders.isLoading"
    >
      {{ $t('payment.processing') }}
    </div>
    <div
      class="max-w-lg flex-1 rounded-lg border border-border bg-card p-4 shadow sm:p-8"
    >
      <div class="mb-4 flex items-center justify-between">
        <h5
          class="text-xl font-bold leading-none text-foreground"
        >
          {{ $t('order.recent_orders') }}
        </h5>
      </div>
      <div class="w-full" @click="this.recentOrders.showOrder = false">
        <input
          type="search"
          id="orderSeach"
          class="pos-input ps-10"
          :placeholder="$t('order.search_placeholder')"
          v-model="this.recentOrders.searchOrder"
          @input="this.recentOrders.handleSearchInput"
        />
        <select
          id="status"
          class="pos-select mt-3"
          v-model="this.recentOrders.selectedStatus"
          @change="this.recentOrders.handleStatusChange"
        >
          <!-- Default. Narrowing to one status is a refinement, not the
               price of seeing anything at all. -->
          <option value="All">{{ $t('status.all') }}</option>
          <option value="Draft">{{ $t('status.draft') }}</option>
          <option value="Unbilled">{{ $t('status.unbilled') }}</option>
          <option
            value="Recently Paid"
            v-if="auth.viewAllStatus === 0 && invoiceData.paidLimit > 0"
          >
            {{ $t('status.recently_paid') }}
          </option>
          <option value="Paid" v-if="this.auth.viewAllStatus === 1">
            {{ $t('status.paid') }}
          </option>
          <option value="Consolidated" v-if="this.auth.viewAllStatus === 1">
            {{ $t('status.consolidated') }}
          </option>
          <option value="Return" v-if="this.auth.viewAllStatus === 1">
            {{ $t('status.return') }}
          </option>
        </select>
      </div>
      <div class="flow-root">
        <ul role="list" class="divide-y divide-border">
          <li
            class="mt-2 py-3 sm:py-4"
            :class="{
              'bg-muted': this.recentOrders.setBackground === index,
            }"
            v-for="(recentOrder, index) in this.recentOrders.filteredOrders"
            :key="recentOrder.name"
            @click="
              this.recentOrders.viewRecentOrder(recentOrder);
              this.recentOrders.setBackground = index;
            "
          >
          <div class="flex w-full">
              <div class="w-3/5">
                <p
                  class="truncate text-base font-medium text-foreground"
                >
                  {{ recentOrder.name }}
                </p>
                <p class="truncate text-sm text-muted-foreground">
                  {{ recentOrder.mobile_number }},{{ recentOrder.customer }}
                </p>
              </div>
              <div class="w-2/5 flex">
                <p class="text-base font-medium text-foreground overflow-hidden text-ellipsis">
                  {{
                    recentOrder.restaurant_table
                      ? recentOrder.restaurant_table
                      : recentOrder.order_type
                  }}
                </p>
              </div>
              <div class="w-1/5 text-right">
                <p
                  class="truncate text-base font-medium text-foreground"
                  >
                  {{ this.invoiceData.currency }}
                  {{ recentOrder.grand_total }}
                </p>
                <p class="truncate text-sm text-muted-foreground">
                  {{
                    this.recentOrders.getFormattedTime(
                      recentOrder.posting_time
                    )
                  }}
                </p>
              </div>
            </div>
          </li>
        </ul>
      </div>
      <div class="mt-4 flex justify-center">
        <button
          :class="{ hidden: this.recentOrders.currentPage === 1 }"
          @click="this.recentOrders.previousPageClick()"
          class="mr-2 w-[80px] rounded-md border px-2 py-1"
        >
          {{ $t('common.previous') }}
        </button>
        <button class="mr-2 rounded-md border px-2 py-1">
          {{ this.recentOrders.currentPage }}
        </button>
        <button
          @click="this.recentOrders.nextPageClick()"
          v-if="this.recentOrders.next"
          class="w-[80px] rounded-md border px-2 py-1"
        >
          {{ $t('common.next') }}
        </button>
      </div>
    </div>
    <div
      class="mt-5 max-w-lg flex-1 rounded-lg border border-border bg-card p-4 shadow sm:p-8 md:ml-10 md:mt-0"
      v-if="this.recentOrders.showOrder"
    >
      <div class="flex items-center space-x-4">
        <div class="min-w-0 flex-1">
          <p
            class="truncate text-xl font-semibold text-foreground"
          >
            {{ this.recentOrders.selectedOrder.customer }}
          </p>
          <p
            class="truncate text-xl font-semibold text-foreground"
          >
            {{ this.recentOrders.selectedOrder.mobile_number }}
          </p>
          <p
            class="mr-2 mt-2 truncate text-sm text-muted-foreground"
          >
            {{ this.recentOrders.postingDate }}
          </p>

          <p
            class="mr-2 mt-2 truncate text-sm text-muted-foreground"
            v-if="this.recentOrders.selectedOrder.waiter"
          >
            Waiter : {{ this.recentOrders.selectedOrder.waiter }}
          </p>
        </div>
        <div class="items-center space-x-4 text-right">
          <div class="min-w-0 flex-1">
            <p
              class="mr-2 truncate text-xl font-semibold text-foreground"
            >
              {{ this.invoiceData.currency }}
              {{
                this.recentOrders.selectedOrder.status === "Draft"
                  ? "0.00"
                  : this.recentOrders.selectedOrder.grand_total
              }}
            </p>
            <p
              class="mr-2 mt-2 truncate text-sm text-muted-foreground"
            >
              {{ this.recentOrders.selectedOrder.name }}
            </p>

            <div class="ml-5 mt-2">
              <Badge
                :type="
                  this.recentOrders.getBadgeType(
                    this.recentOrders.selectedOrder
                  )
                "
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="currentColor"
                  class="bi bi-dot"
                  viewBox="0 0 16 16"
                >
                  <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />
                </svg>
                <span class="text-xs">
                  {{ this.recentOrders.selectedOrder.status }}
                </span>
              </Badge>
            </div>
          </div>
        </div>
      </div>
      <div class="mb-2 mt-4">
        <p class="truncate text-lg font-semibold text-foreground">
          {{ $t('menu.items') }}
        </p>
      </div>
      <div class="w-full rounded-xl bg-muted p-2">
        <div
          class="ml-2 mt-2"
          v-for="items in this.recentOrders.recentOrderListItems"
        >
          <div class="flex items-center space-x-4">
            <div class="min-w-2 flex-1">
              <p class="truncate text-base text-foreground">
                {{ items.item_name }}
              </p>
            </div>
            <div class="flex items-center space-x-4 text-right">
              <p class="text-base text-foreground">
                {{ items.qty }}
              </p>
            </div>
            <div class="items-center space-x-4 text-right">
              <p class="mr-5 truncate text-base text-foreground">
                {{ this.invoiceData.currency }} {{ items.amount }}
              </p>
            </div>
          </div>
        </div>
      </div>
      <div
        class="mt-4 rounded-md border-2 border-dotted"
        :class="[
          {
            'border-border': !recentOrders.showDiscount,
            'border-green-500': recentOrders.showDiscount,
            'border-red-500':recentOrders.totalAmount <= 0
          },
        ]"
        v-if="
          invoiceData.enableDiscount == 1 &&
          !recentOrders.showInput &&
          this.recentOrders.selectedStatus === 'Draft'
        "
      >
        <div
          @click="recentOrders.toggleDiscount"
          :class="{
            'flex p-3': !recentOrders.showInput && !recentOrders.showDiscount,
            'flex p-3 text-green-500': recentOrders.showDiscount,
            'flex p-3 text-red-500':recentOrders.totalAmount <= 0
          }"
        >
        <svg
            class="discount-icon"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            stroke="currentColor"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M19 15.6213C19 15.2235 19.158 14.842 19.4393 14.5607L20.9393 13.0607C21.5251 12.4749 21.5251 11.5251 20.9393 10.9393L19.4393 9.43934C19.158 9.15804 19 8.7765 19 8.37868V6.5C19 5.67157 18.3284 5 17.5 5H15.6213C15.2235 5 14.842 4.84196 14.5607 4.56066L13.0607 3.06066C12.4749 2.47487 11.5251 2.47487 10.9393 3.06066L9.43934 4.56066C9.15804 4.84196 8.7765 5 8.37868 5H6.5C5.67157 5 5 5.67157 5 6.5V8.37868C5 8.7765 4.84196 9.15804 4.56066 9.43934L3.06066 10.9393C2.47487 11.5251 2.47487 12.4749 3.06066 13.0607L4.56066 14.5607C4.84196 14.842 5 15.2235 5 15.6213V17.5C5 18.3284 5.67157 19 6.5 19H8.37868C8.7765 19 9.15804 19.158 9.43934 19.4393L10.9393 20.9393C11.5251 21.5251 12.4749 21.5251 13.0607 20.9393L14.5607 19.4393C14.842 19.158 15.2235 19 15.6213 19H17.5C18.3284 19 19 18.3284 19 17.5V15.6213Z"
              stroke-miterlimit="10"
              stroke-linecap="round"
              stroke-linejoin="round"
            ></path>
            <path
              d="M15 9L9 15"
              stroke-miterlimit="10"
              stroke-linecap="round"
              stroke-linejoin="round"
            ></path>
            <path
              d="M10.5 9.5C10.5 10.0523 10.0523 10.5 9.5 10.5C8.94772 10.5 8.5 10.0523 8.5 9.5C8.5 8.94772 8.94772 8.5 9.5 8.5C10.0523 8.5 10.5 8.94772 10.5 9.5Z"
              fill="white"
              stroke-linecap="round"
              stroke-linejoin="round"
            ></path>
            <path
              d="M15.5 14.5C15.5 15.0523 15.0523 15.5 14.5 15.5C13.9477 15.5 13.5 15.0523 13.5 14.5C13.5 13.9477 13.9477 13.5 14.5 13.5C15.0523 13.5 15.5 13.9477 15.5 14.5Z"
              fill="white"
              stroke-linecap="round"
              stroke-linejoin="round"
            ></path>
          </svg>

          <template v-if="!recentOrders.showDiscount">
            <span>{{ $t('payment.add_discount') }}</span>
          </template>

          <template v-else>
            <span v-if="recentOrders.totalAmount > 0">
              Additional {{ recentOrders.percentage }}% discount Applied
            </span>
            <span v-else class="text-red-500">
              {{ recentOrders.percentage }}% cannot be Applied
            </span>
          </template>
        </div>
      </div>
      <div class="relative mb-6 mt-6" v-if="this.recentOrders.showInput">
        <input
          type="number"
          class="block w-full rounded-lg border border-input bg-muted p-2.5 pl-10 text-sm text-foreground focus:border-ring focus:ring-ring"
          :placeholder="$t('payment.enter_discount_pct')"
          v-model="this.recentOrders.percentage"
          @input="this.recentOrders.updatePercentage"
          @keyup.enter="this.recentOrders.applyDiscount"
          @keyup="this.recentOrders.resetTimer"
        />
      </div>
      <div class="mb-2 mt-5">
        <p class="truncate text-lg font-semibold text-foreground">
          {{ $t('totals.title') }}
        </p>
      </div>
      <div class="w-full rounded-xl bg-muted p-2">
        <div class="ml-2 mt-2 flex items-center space-x-4">
          <div class="min-w-2 flex-1">
            <p class="truncate text-base text-foreground">
              {{ $t('totals.net_total') }}
            </p>
          </div>

          <div class="items-center space-x-4 text-right">
            <p class="mr-5 truncate text-base text-foreground">
              {{ this.invoiceData.currency }} {{ this.recentOrders.netTotal }}
            </p>
          </div>
        </div>
        <div class="ml-2" v-for="tax in this.recentOrders.texDetails">
          <div class="mt-2 flex items-center space-x-4">
            <div class="min-w-2 flex-1">
              <p class="truncate text-base text-foreground">
                {{ tax.description }}
              </p>
            </div>

            <div class="items-center space-x-4 text-right">
              <p class="mr-5 truncate text-base text-foreground">
                {{ this.invoiceData.currency }} {{ tax.rate }}
              </p>
            </div>
          </div>
        </div>
        <div
          class="ml-2 mt-2 flex items-center space-x-4"
          v-if="this.recentOrders.additionalPiscountPercentage"
        >
          <div class="min-w-2 flex-1">
            <p
              class="truncate text-base font-semibold text-foreground"
            >
              Discount({{ this.recentOrders.additionalPiscountPercentage }})
            </p>
          </div>
          <div class="items-center space-x-4 text-right">
            <p
              class="mr-5 truncate text-base font-semibold text-foreground"
            >
              {{ this.invoiceData.currency }}
              {{ this.recentOrders.discountAmount }}
            </p>
          </div>
        </div>
        <div class="ml-2 mt-2 flex items-center space-x-4">
          <div class="min-w-2 flex-1">
            <p
              class="truncate text-base font-semibold text-foreground"
            >
              {{ $t('totals.grand_total') }}
            </p>
          </div>
          <div class="items-center space-x-4 text-right">
            <p
              class="mr-5 truncate text-base font-semibold text-foreground"
            >
              {{ this.invoiceData.currency }}
              {{
                this.recentOrders.totalAmount > 0
                  ? this.recentOrders.totalAmount
                  : this.recentOrders.grandTotal
              }}
            </p>
          </div>
        </div>
      </div>
      <div
        class="mt-2 rounded-xl px-4 py-2 text-center"
        v-if="
          this.recentOrders.selectedStatus !== 'Draft' &&
          recentOrders.selectedStatus !== 'Unbilled'
        "
      >
        <button
          type="button"
          class="mb-2 mr-2 rounded-lg border border-input bg-card px-5 py-2.5 text-sm font-medium text-foreground focus:outline-none"
          @click="this.invoiceData.printFunction()"
        >
          {{ $t('order.print_receipt') }}
        </button>
      </div>
      <div
        class="mt-2 rounded-xl px-4 py-2 text-center"
        v-if="
          this.recentOrders.selectedStatus === 'Draft' ||
          recentOrders.selectedStatus === 'Unbilled'
        "
      >
        <button
          type="button"
          class="mb-2 mr-2 w-36 rounded-lg border bg-card px-5 py-2.5 text-sm font-medium focus:outline-none"
          :class="{
            'border-border text-muted-foreground/60':
              this.recentOrders.orderType === 'Aggregators',
            'border-input text-foreground':
              this.recentOrders.orderType !== 'Aggregators',
          }"
          @click="
            this.recentOrders.orderType !== 'Aggregators'
              ? this.recentOrders.editOrder()
              : ''
          "
        >
          {{ $t('common.edit') }}
        </button>
        <button
          type="button"
          class="mb-2 mr-2 w-36 rounded-lg border border-input bg-card px-5 py-2.5 text-sm font-medium text-foreground focus:outline-none"
          @click="this.invoiceData.printFunction()"
        >
          {{ $t('order.print_receipt') }}
        </button>
      </div>
      <div
        class="mt-2 rounded-xl px-4 py-2 text-center"
        v-if="
          this.recentOrders.selectedStatus === 'Draft' ||
          this.recentOrders.selectedStatus === 'Unbilled'
        "
      >
        <button
          type="button"
          class="mb-2 mr-2 w-36 rounded-lg border border-input bg-card px-5 py-2.5 text-sm font-medium text-foreground focus:outline-none"
          @click="this.recentOrders.billing()"
        >
          {{ $t('payment.make_payment') }}
        </button>
        <button
          type="button"
          class="mb-2 mr-2 w-36 rounded-lg border bg-card px-5 py-2.5 text-sm font-medium focus:outline-none"
          :class="{
            'border-border text-muted-foreground/60':
              this.recentOrders.invoicePrinted === 1 ||
              this.recentOrders.selectedStatus === 'Unbilled',
            'border-input text-foreground': !(
              this.recentOrders.invoicePrinted === 1 ||
              this.recentOrders.selectedStatus === 'Unbilled'
            ),
          }"
          @click="
            this.recentOrders.invoicePrinted === 0 &&
            this.recentOrders.selectedStatus === 'Draft'
              ? this.recentOrders.showCancelInvoiceModal()
              : ''
          "
        >
          {{ $t('order.cancel_order') }}
        </button>

        <!--
          Free the table without printing.

          Only offered where it means something: an order still holding a
          table whose bill has not been closed out. Once the bill is closed —
          printed or not — the table is already free and the button would be
          a no-op dressed as an action.
        -->
        <button
          v-if="canCloseTable"
          type="button"
          class="pos-btn-ghost mb-2 mr-2 w-36"
          @click="this.recentOrders.showCloseTableModal()"
        >
          {{ $t('order.close_table') }}
        </button>
      </div>

      <!--
        Closing a table settles the bill as well as releasing the floor, so it
        asks first and asks why. The reason is what a manager reads later when
        a shift's takings do not match its covers.
      -->
      <div v-if="this.recentOrders.closeTableFlag" class="pos-overlay">
        <div class="flex min-h-full items-center justify-center p-4">
          <div class="pos-card w-full max-w-md p-6 animate-scale-in" role="dialog">
            <div class="flex items-start justify-between gap-3">
              <h2 class="pos-title">{{ $t('order.close_table_title') }}</h2>
              <button
                type="button"
                class="press -me-2 -mt-2 rounded-lg px-2 py-1 text-xl font-bold text-muted-foreground hover:bg-muted"
                :aria-label="$t('common.close')"
                @click="this.recentOrders.closeTableFlag = false"
              >✕</button>
            </div>

            <p class="mt-2 text-sm font-medium text-muted-foreground">
              {{ $t('order.close_table_body') }}
            </p>

            <div class="mt-4 rounded-xl bg-muted px-4 py-3">
              <p class="pos-label">{{ $t('tables.title') }}</p>
              <p class="text-base font-bold text-foreground">
                {{ this.recentOrders.restaurantTable }}
              </p>
            </div>

            <label for="closeReason" class="pos-label mb-1.5 mt-4 block">
              {{ $t('order.reason') }}
            </label>
            <input
              id="closeReason"
              type="text"
              class="pos-input"
              :placeholder="$t('order.close_table_reason_hint')"
              v-model="this.recentOrders.closeTableReason"
            />

            <div class="mt-6 flex gap-3">
              <button
                type="button"
                class="pos-btn-ghost flex-1"
                @click="this.recentOrders.closeTableFlag = false"
              >
                {{ $t('common.no') }}
              </button>
              <button
                type="button"
                class="pos-btn-primary flex-1"
                :disabled="this.recentOrders.closingTable || !this.recentOrders.closeTableReason.trim()"
                @click="this.recentOrders.closeTable()"
              >
                {{ this.recentOrders.closingTable ? $t('order.closing') : $t('order.close_table') }}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div
        v-if="this.recentOrders.cancelInvoiceFlag === true"
        class="fixed inset-0 z-10 mt-20 overflow-y-auto bg-muted"
      >
        <div class="mt-20 flex items-center justify-center">
          <div class="w-full rounded-lg bg-card p-6 shadow-raised md:max-w-md">
            <div class="flex justify-end">
              <span class="sr-only">{{ $t('common.close') }}</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                @click="this.recentOrders.cancelInvoiceFlag = false"
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
              {{ $t('order.confirm_cancel') }}
            </h2>
            <div class="relative">
              <label
                for="cancelReason"
                class="mt-6 block text-left text-foreground"
              >
                {{ $t('order.reason') }}
              </label>
              <input
                type="text"
                id="cancelReason"
                class="mt-4 w-full appearance-none rounded-xl border p-2 leading-tight text-foreground shadow focus:outline-none"
                v-model="this.recentOrders.cancelReason"
              />
            </div>
            <div class="flex justify-end">
              <button
                @click="this.recentOrders.cancelInvoiceFlag = false"
                class="mr-3 mt-6 rounded-xl border border-input bg-muted px-3 py-2"
              >
                {{ $t('common.no') }}
              </button>
              <button
                @click="handleConfirmCancellation()"
                class="mt-6 rounded-xl bg-primary px-3 py-2 text-primary-foreground hover:bg-primary"
              >
                {{ $t('common.yes') }}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div
        v-if="this.recentOrders.showPayment"
        class="fixed inset-0 z-10 mt-14 overflow-y-auto bg-muted"
      >
        <div class="mt-10 flex items-center justify-center">
          <div class="h-82 w-full rounded-lg bg-card p-6 shadow-raised md:w-3/5">
            <div class="flex justify-end">
              <span class="sr-only">{{ $t('common.close') }}</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                @click="this.recentOrders.showPayment = false"
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
              {{ $t('payment.select_mode') }}
            </h2>
            <div class="mt-8 flex items-center justify-center">
              <div class="w-full max-w-full overflow-x-auto">
                <div class="flex flex-nowrap">
                  <div
                    v-for="(
                      modeOfPayment, index
                    ) in recentOrders.modeOfPaymentList"
                    :key="index"
                    class="mr-4 w-64 flex-shrink-0 rounded-lg border border-border bg-card p-4 shadow"
                  >
                    <label
                      :for="'modeofPayments-' + index"
                      class="block text-left text-lg"
                    >
                      {{ modeOfPayment.mode_of_payment }}
                    </label>
                    <input
                      :id="'modeofPayments-' + index"
                      type="number"
                      name="modeofPayments"
                      class="block w-full rounded-lg border border-input bg-muted p-2.5 text-sm text-foreground focus:border-ring focus:ring-ring"
                      required
                      v-model.number="modeOfPayment.value"
                      @click="recentOrders.calculatePaidAmount(modeOfPayment)"
                      @input="
                        recentOrders.changePaidAmount(
                          modeOfPayment.mode_of_payment,
                          $event.target.value
                        )
                      "
                    />
                  </div>
                </div>
              </div>
            </div>
            <div v-if="recentOrders.changeAmount > 0" class="mt-4 p-4 bg-muted rounded-lg">
              <div class="flex justify-between items-center mt-2 text-success">
                <span class="text-lg font-medium">{{ $t('payment.change_amount') }}</span>
                <span class="text-lg">₹ {{ recentOrders.changeAmount.toFixed(2) }}</span>
              </div>
            </div>
            <div class="flex justify-end">
              <button
                @click="
                  this.recentOrders.showPayment = false;
                  this.recentOrders.makePayment();
                "
                class="mt-10 rounded-xl bg-primary px-3 py-2 text-primary-foreground hover:bg-primary"
              >
                {{ $t('common.submit') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { usetoggleRecentOrder } from "@/stores/recentOrder.js";
import { useInvoiceDataStore } from "@/stores/invoiceData.js";
import { useAuthStore } from "@/stores/Auth.js";
import { Badge } from "flowbite-vue";
import { useNotifications } from "@/stores/Notification.js";
export default {
  name: "RecentOrder",
  components: {
    Badge,
  },
  methods: {
    handleConfirmCancellation() {
      if (!this.recentOrders.cancelReason || this.recentOrders.cancelReason.trim() === '') {
        this.notification.createNotification('Please enter a reason for cancellation');
        return;
      }
      this.recentOrders.cancelInvoice();
      this.recentOrders.cancelInvoiceFlag = false;
    },
  },
  setup() {
    const recentOrders = usetoggleRecentOrder();
    const invoiceData = useInvoiceDataStore();
    const auth = useAuthStore();
    const notification = useNotifications();
    return { recentOrders, invoiceData, auth, notification };
  },
  computed: {
    /**
     * Whether this order is still holding a table.
     *
     * Three things must be true: the order is attached to a table, its bill
     * has not been closed out yet, and it has not been cancelled. Anything
     * else and the table is already free, so offering to free it would be an
     * action that does nothing.
     */
    canCloseTable() {
      const order = this.recentOrders.selectedOrder;
      if (!order) return false;
      return Boolean(
        this.recentOrders.restaurantTable &&
          this.recentOrders.invoicePrinted === 0 &&
          order.status !== "Cancelled"
      );
    },
  },
  mounted() {
    this.recentOrders.handleStatusChange();
  },
};
</script>
<style>
.bg-muted {
  background-color: rgba(0, 0, 0, 0.2);
}
</style>
