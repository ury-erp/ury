import { defineStore } from 'pinia';

export const useNotificationModal = defineStore('notificationModal', {
  state: () => ({
    isOpen: false,
    title: '',
    message: '',
    actionText: 'OK',
    onConfirm: null,
    onCancel: null,
    showCancelButton: false
  }),

  actions: {
    showModal(options) {

      this.isOpen = true;
      this.title = options.title || '';
      this.message = options.message || '';
      this.actionText = options.actionText || 'OK';
      this.onConfirm = options.onConfirm;
      this.onCancel = options.onCancel;
      this.showCancelButton = options.showCancelButton || false;
    },

    closeModal() {
      this.isOpen = false;
      setTimeout(() => {
        this.title = '';
        this.message = '';
        this.actionText = 'OK';
        this.onConfirm = null;
        this.onCancel = null;
        this.showCancelButton = false;
      }, 200);
    },

    handleConfirm() {
      if (typeof this.onConfirm === 'function') {
        this.onConfirm();
      }
      this.closeModal();
    },

    handleCancel() {
      if (typeof this.onCancel === 'function') {
        this.onCancel();
      }
      this.closeModal();
    }
  }
});