import { defineStore } from 'pinia';
import { markRaw } from 'vue';

export const useNotificationModal = defineStore('notificationModal', {
  state: () => ({
    isOpen: false,
    title: '',
    message: '',
    actionText: 'OK',
    onConfirm: null,
    onCancel: null,
    showCancelButton: false,
    _closeTimeout: null,
  }),

  actions: {
    showModal(options) {
      if (this._closeTimeout) {
        clearTimeout(this._closeTimeout);
        this._closeTimeout = null;
      }

      this.isOpen = true;
      this.title = options.title || '';
      this.message = options.message || '';
      this.actionText = options.actionText || 'OK';
      this.onConfirm = options.onConfirm ? markRaw(options.onConfirm) : null;
      this.onCancel = options.onCancel ? markRaw(options.onCancel) : null;
      this.showCancelButton = options.showCancelButton || false;
    },

    closeModal() {
      this.isOpen = false;
      if (this._closeTimeout) {
        clearTimeout(this._closeTimeout);
      }
      this._closeTimeout = setTimeout(() => {
        this.title = '';
        this.message = '';
        this.actionText = 'OK';
        this.onConfirm = null;
        this.onCancel = null;
        this.showCancelButton = false;
        this._closeTimeout = null;
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