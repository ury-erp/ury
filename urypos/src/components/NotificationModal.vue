<template>
  <Teleport to="body">
    <div
      v-if="modal.isOpen"
      class="font-inter fixed inset-0 z-50 overflow-y-auto bg-black/25"
    >
      <div class="flex justify-center px-4 pt-16">
        <!-- Modal Content -->
        <div class="relative w-[576px] rounded-lg bg-white shadow-lg">
          <!-- Modal Header -->
          <div class="border-b border-b-gray-200 px-6 py-4">
            <div class="text-lg font-medium">{{ modal.title }}</div>
          </div>

          <!-- Modal Body -->
          <div class="p-5 px-6 pb-5">
            <p class="whitespace-pre-line text-black">
              {{ modal.message }}
            </p>
          </div>

          <!-- Modal Footer -->
          <div
            class="flex justify-end gap-2 rounded-b-md border-t border-t-gray-200 px-6 py-3"
          >
            <button
              v-if="modal.showCancelButton"
              @click="modal.handleCancel"
              class="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              No
            </button>
            <button
              @click="modal.handleConfirm"
              class="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800"
            >
              Yes
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script>
import { defineComponent } from "vue";
import { useNotificationModal } from "../stores/NotificationModal";
import { storeToRefs } from "pinia";

export default defineComponent({
  name: "NotificationModal",
  setup() {
    const modal = useNotificationModal();
    const { isOpen, message, showCancelButton } = storeToRefs(modal);

    return {
      modal,
      isOpen,
      message,
      showCancelButton,
    };
  },
});
</script>
