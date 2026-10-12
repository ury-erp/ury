<template>
  <Teleport to="body">
    <div
      v-if="modal.isOpen"
      class="font-inter fixed inset-0 z-50 overflow-y-auto bg-black/25"
    >
      <div class="flex justify-center px-4 pt-16">
        <!-- Modal Content -->
        <div class="relative w-[576px] rounded-lg bg-card shadow-raised">
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
              class="rounded-xl border border-input bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
            >
              {{ $t('common.no') }}
            </button>
            <button
              @click="modal.handleConfirm"
              class="rounded-xl bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary"
            >
              {{ $t('common.yes') }}
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
