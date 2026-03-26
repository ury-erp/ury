/**
 * Main kiosk state management hook
 * Combines device auth, view state, and cart functionality
 */

import { useState, useCallback, useMemo } from 'react';
import { MenuItem } from '@ury/menu';
import { useCart } from '@ury/cart';
import { KioskView, KioskConfig, KioskState } from '@/types';
import { useDeviceAuth } from './useDeviceAuth';
import { useInactivityTimeout } from './useInactivityTimeout';

interface UseKioskOptions {
  inactivityTimeoutMs?: number;
  inactivityWarningMs?: number;
}

export function useKiosk(options: UseKioskOptions = {}) {
  const {
    inactivityTimeoutMs = 90 * 1000, // 90 seconds
    inactivityWarningMs = 10 * 1000, // 10 seconds warning
  } = options;

  const { config, isConfigured, isLoading: authLoading, error: authError } = useDeviceAuth();
  const cart = useCart();

  // Kiosk state
  const [state, setState] = useState<KioskState>({
    currentView: 'attract',
    selectedItem: null,
    selectedCategory: null,
    orderType: null,
    customerPhone: '',
    lastOrderToken: null,
    inactivityWarning: false,
  });

  // Actions
  const setView = useCallback((view: KioskView) => {
    setState(prev => ({ ...prev, currentView: view, inactivityWarning: false }));
  }, []);

  const selectItem = useCallback((item: MenuItem | null) => {
    setState(prev => ({ ...prev, selectedItem: item }));
  }, []);

  const selectCategory = useCallback((category: string | null) => {
    setState(prev => ({ ...prev, selectedCategory: category }));
  }, []);

  const setOrderType = useCallback((type: 'Dine In' | 'Take Away') => {
    setState(prev => ({ ...prev, orderType: type }));
  }, []);

  const setCustomerPhone = useCallback((phone: string) => {
    setState(prev => ({ ...prev, customerPhone: phone }));
  }, []);

  const setLastOrderToken = useCallback((token: string) => {
    setState(prev => ({ ...prev, lastOrderToken: token }));
  }, []);

  const setInactivityWarning = useCallback((show: boolean) => {
    setState(prev => ({ ...prev, inactivityWarning: show }));
  }, []);

  // Reset to attract screen
  const resetToAttract = useCallback(() => {
    cart.clearCart();
    setState({
      currentView: 'attract',
      selectedItem: null,
      selectedCategory: null,
      orderType: null,
      customerPhone: '',
      lastOrderToken: null,
      inactivityWarning: false,
    });
  }, [cart]);

  // Inactivity timeout (disabled on attract and confirmation screens)
  const inactivityEnabled = useMemo(() => {
    return state.currentView !== 'attract' && state.currentView !== 'confirmation';
  }, [state.currentView]);

  useInactivityTimeout({
    timeoutMs: inactivityTimeoutMs,
    warningMs: inactivityWarningMs,
    onTimeout: resetToAttract,
    onWarning: setInactivityWarning,
    enabled: inactivityEnabled,
  });

  // Navigation helpers
  const goToMenu = useCallback(() => setView('menu'), [setView]);
  const goToItemDetail = useCallback((item: MenuItem) => {
    selectItem(item);
    setView('item-detail');
  }, [selectItem, setView]);
  const goToCheckout = useCallback(() => setView('checkout'), [setView]);
  const goToConfirmation = useCallback(() => setView('confirmation'), [setView]);
  const backToMenu = useCallback(() => {
    selectItem(null);
    setView('menu');
  }, [selectItem, setView]);

  return {
    // Config
    config,
    isConfigured,
    isLoading: authLoading,
    error: authError,

    // State
    ...state,

    // Cart
    cart,

    // Actions
    setView,
    selectItem,
    selectCategory,
    setOrderType,
    setCustomerPhone,
    setLastOrderToken,
    resetToAttract,

    // Navigation shortcuts
    goToMenu,
    goToItemDetail,
    goToCheckout,
    goToConfirmation,
    backToMenu,
  };
}

export default useKiosk;
