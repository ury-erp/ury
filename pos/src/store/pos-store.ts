import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { storage } from '@ury/core';
import { getRestaurantMenu, getAggregatorMenu, MenuItem as APIMenuItem } from '../lib/menu-api';
import { getCurrencyInfo, PosProfileCombined, getCombinedPosProfile } from '../lib/pos-profile-api';
import { getMenuCourses } from '../lib/menu-course-api';
import { getCustomerGroups, getCustomerTerritories } from '../lib/customer-api';
import { DEFAULT_ORDER_TYPE, OrderType } from '../data/order-types';
import { getTableOrder, TableOrder } from '../lib/order-api';
import { getPaymentModes } from '../lib/payment-api';

// Constants
const MAX_QUANTITY = 99;
const MIN_QUANTITY = 0;

// Custom error class for cart operations
class CartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CartError';
  }
}

// Extend the API MenuItem to include UI-specific properties
export interface MenuItem extends Omit<APIMenuItem, 'rate' | 'item_image'> {
  id: string;
  name: string;
  image: string | null;
  price: number;
  quantity?: number;
  description?: string;
  special_dish?: 1 | 0;
  category?: string;
  variants?: Array<{ id: string; name: string; price: number }>;
  addons?: Array<{ id: string; name: string; price: number; category: 'sides' | 'drinks' | 'desserts' }>;
  selectedVariant?: { id: string; name: string; price: number };
  selectedAddons?: Array<{ id: string; name: string; price: number }>;
  uniqueId?: string;
  tax_rate?: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
}

export interface OrderItem extends MenuItem {
  quantity: number;
  selectedVariant?: { id: string; name: string; price: number };
  selectedAddons?: { id: string; name: string; price: number }[];
  uniqueId?: string;
  comment?: string;
}

export interface PaymentMode {
  id: string;
  name: string;
  enabled: boolean;
}

export interface Category {
  name: string;
  label: string;
}

export interface Order {
  id: string;
  cartId: string;
  customerId?: string;
  paymentModeId: string;
  paymentMode: string;
  orderType: OrderType;
  status: 'pending' | 'paid' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  totalAmount: number;
  paidAmount: number;
  createdAt: string;
  updatedAt: string;
}

interface CartTotals {
  subtotal: number;
  tax: number;
  total: number;
  itemCount: number;
}

interface Aggregator {
  customer: string;
}

interface OrderTabState {
  activeOrders: OrderItem[];
  selectedCustomer: Customer | null;
  selectedOrderType: OrderType;
  selectedTable: string | null;
  selectedRoom: string | null;
  selectedAggregator: Aggregator | null;
  orderId: string | null;
  isUpdatingOrder: boolean;
  orderComment: string;
  originalCartHash: string;
}

interface POSState {
  menuItems: MenuItem[];
  categories: Category[];
  activeOrders: OrderItem[];
  selectedCategory: string;
  selectedTable: string | null;
  selectedRoom: string | null;
  searchQuery: string;
  selectedCustomer: Customer | null;
  selectedOrderType: OrderType;
  quickFilter: 'all' | 'special';
  selectedItem: MenuItem | null;
  cartId: string | null;
  loading: boolean;
  menuLoading: boolean;
  orderLoading: boolean;
  profileLoading: boolean;
  error: string | null;
  paymentModes: string[];
  orders: Order[];
  selectedAggregator: Aggregator | null;
  currency: string;
  currencySymbol: string | null;
  isUpdatingOrder: boolean;
  orderId: string | null;
  posProfile: PosProfileCombined | null;
  customerGroups: string[];
  territories: string[];
  tableOrder: TableOrder | null;
  isInitializing: boolean;
  orderComment: string;
  originalCartHash: string;
  
  tabOrder: { id: string, name: string }[];
  activeTabId: string;
  nextTabNumber: number;
  heldTabs: Record<string, OrderTabState>;
}

interface POSStore extends POSState {
  fetchMenuItems: () => Promise<void>;
  fetchAggregatorMenu: (aggregator: string) => Promise<void>;
  fetchCategories: () => Promise<void>;
  fetchPaymentModes: () => Promise<void>;
  addToOrder: (item: OrderItem) => Promise<void>;
  removeFromOrder: (uniqueId: string) => Promise<void>;
  updateQuantity: (uniqueId: string, quantity: number) => Promise<void>;
  clearOrder: () => Promise<void>;
  setSelectedCategory: (category: string) => void;
  setSearchQuery: (query: string) => void;
  setSelectedCustomer: (customer: Customer | null) => void;
  setSelectedTable: (table: string | null, room: string | null, doNotLoadOrder?: boolean) => void;
  setSelectedOrderType: (type: OrderType) => void;
  setQuickFilter: (filter: 'all' | 'special') => void;
  setSelectedItem: (item: MenuItem | null) => void;
  initializeCart: () => Promise<void>;
  processPayment: (paymentMode: string, amount: number) => Promise<void>;
  updateOrderStatus: (orderId: string, status: Order['status']) => Promise<void>;
  fetchPosProfile: () => Promise<void>;
  fetchCustomerGroups: () => Promise<void>;
  fetchTerritories: () => Promise<void>;
  fetchCurrencySymbol: () => Promise<void>;
  getCartTotals: () => CartTotals;
  itemExistsInCart: (uniqueId: string) => boolean;
  validateQuantity: (quantity: number) => boolean;
  getItemPrice: (item: OrderItem) => number;
  getItemQuantityFromCart: (item: MenuItem) => number;
  loadTableOrder: (table: string) => Promise<void>;
  clearTableOrder: () => void;
  isMenuInteractionDisabled: () => boolean;
  isOrderInteractionDisabled: () => boolean;
  initializeApp: () => Promise<void>;
  setOrderForUpdate: (orderId: string | null) => void;
  resetOrderState: () => void;
  setSelectedAggregator: (aggregator: Aggregator | null) => void;
  setOrderComment: (comment: string) => void;
  addTab: () => void;
  switchTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  openDraftOrderInNewTab: (draft: {
    orderId: string;
    orderType: OrderType;
    customer: Customer | null;
    table: string | null;
    room: string | null;
    items: OrderItem[];
  }) => void;
  reorderTabs: (sourceIndex: number, destinationIndex: number) => void;
}

const generateUniqueId = (item: OrderItem): string => {
  const variantId = item.selectedVariant?.id || 'default';
  const addonIds = item.selectedAddons?.map(addon => addon.id).sort().join('-') || 'no-addons';
  return `${item.id}-${variantId}-${addonIds}`;
};

const calculateItemPrice = (item: OrderItem): number => {
  const basePrice = item.selectedVariant?.price || item.price;
  const addonsTotal = item.selectedAddons?.reduce((sum, addon) => sum + addon.price, 0) || 0;
  return basePrice + addonsTotal;
};



export const generateCartHash = (state: Partial<POSState>) => {
  // Use stable semantic fields instead of uniqueId, which differs between
  // server-assigned IDs (from handleEditOrder) and client-generated IDs (addToOrder).
  const items = state.activeOrders
    ?.map(i => ({
      itemId: i.id,
      qty: i.quantity,
      variantId: i.selectedVariant?.id ?? null,
      addonIds: i.selectedAddons?.map(a => a.id).sort() ?? [],
      comment: i.comment ?? '',
    }))
    // Sort by itemId so order in array doesn't produce false positives.
    .sort((a, b) => (a.itemId > b.itemId ? 1 : a.itemId < b.itemId ? -1 : 0));
  return JSON.stringify({
    items,
    customer: state.selectedCustomer?.id ?? null,
    comment: state.orderComment ?? '',
  });
};

const getInitialTabsState = () => {
  try {
    const saved = localStorage.getItem('posOrderTabsData');
    if (saved) {
      const data = JSON.parse(saved);
      if (data && data.tabOrder && data.tabOrder.length > 0) {
        return {
          tabOrder: data.tabOrder,
          activeTabId: data.activeTabId,
          nextTabNumber: data.nextTabNumber,
          heldTabs: data.heldTabs || {},
          ...data.activeTabState
        };
      }
    }
  } catch(e) {
    console.error('Failed to parse order tabs from localStorage', e);
  }
  
  const initialId = uuidv4();
  return {
    tabOrder: [{ id: initialId, name: 'Tab 1' }],
    activeTabId: initialId,
    nextTabNumber: 2,
    heldTabs: {},
    activeOrders: [],
    selectedCustomer: null,
    selectedOrderType: DEFAULT_ORDER_TYPE as OrderType,
    selectedTable: null,
    selectedRoom: null,
    selectedAggregator: null,
    orderId: null,
    isUpdatingOrder: false,
    orderComment: '',
    originalCartHash: '',
  };
};

const initialTabsState = getInitialTabsState();

export const usePOSStore = create<POSStore>((set, get) => ({
  ...initialTabsState,

  menuItems: [],
  categories: [],
  selectedCategory: '',
  searchQuery: '',
  quickFilter: "all",
  selectedItem: null,
  cartId: null,
  loading: false,
  menuLoading: false,
  orderLoading: false,
  profileLoading: false,
  error: null,
  paymentModes: ['Cash'],
  orders: [],
  posProfile: null,
  customerGroups: [],
  territories: [],
  currency: storage.getItem('currency') || 'INR',
  currencySymbol: storage.getItem('currencySymbol') || null,
  tableOrder: null,
  isInitializing: true,

  initializeApp: async () => {
    try {
      set({ isInitializing: true, error: null });
      
      const [profileResult, menuResult, categoriesResult, paymentModesResult] = await Promise.allSettled([
        get().fetchPosProfile(),
        get().fetchMenuItems(),
        get().fetchCategories(),
        get().fetchPaymentModes()
      ]);

      if (profileResult.status === 'rejected' || 
          menuResult.status === 'rejected' || 
          categoriesResult.status === 'rejected' ||
          paymentModesResult.status === 'rejected') {
        set({ 
          error: 'Failed to initialize app. Please refresh the page.',
          isInitializing: false 
        });
        return;
      }

      set({ isInitializing: false });
    } catch (error) {
      set({ 
        error: 'Failed to initialize app. Please refresh the page.',
        isInitializing: false 
      });
    }
  },

  fetchPosProfile: async () => {
    try {
      const cached = sessionStorage.getItem('posProfile');
      if (cached) {
        const profile = JSON.parse(cached);
        set({ 
          posProfile: profile, 
          profileLoading: false,
          currency: profile.currency || 'INR'
        });
        if (!storage.getItem('currencySymbol')) {
          await get().fetchCurrencySymbol();
        }
        return;
      }

      set({ profileLoading: true, error: null });
      const combinedProfile = await getCombinedPosProfile();
      
      sessionStorage.setItem('posProfile', JSON.stringify(combinedProfile));
      set({ 
        posProfile: combinedProfile, 
        profileLoading: false,
        currency: combinedProfile.currency || 'INR'
      });
      
      if (!storage.getItem('currencySymbol')) {
        await get().fetchCurrencySymbol();
      }
    } catch (error) {
      console.error('Error fetching POS profile:', error);
      set({ 
        error: 'Failed to fetch POS profile',
        profileLoading: false 
      });
    }
  },

  fetchCurrencySymbol: async () => {
    try {
      const currency = get().currency;
      const response = await getCurrencyInfo(currency);
      const { symbol } = response;
      
      set({ currencySymbol: symbol });
      storage.setItem('currencySymbol', symbol);
    } catch (error) {
      console.error('Error fetching currency symbol:', error);
      set({ currencySymbol: get().currency });
      storage.setItem('currencySymbol', get().currency);
    }
  },

  fetchMenuItems: async () => {
    const { posProfile, selectedRoom, selectedOrderType } = get();
    if (!posProfile?.restaurant) return;

    try {
      set({ menuLoading: true, error: null });
      const items = await getRestaurantMenu(posProfile.name, selectedRoom, selectedOrderType);
      
      const menuItems: MenuItem[] = items.map((item: any) => ({
        id: item.item,
        name: item.item_name,
        image: item.item_image || null,
        price: typeof item.rate === 'string' ? parseFloat(item.rate) : item.rate || 0,
        item: item.item,
        item_name: item.item_name,
        item_image: item.item_image,
        course: item.course,
        course_label: item.course_label || item.course,
        description: item.description || '',
        special_dish: item.special_dish || 0,
        tax_rate: 0,
      }));

      set({ menuItems });
    } catch (error) {
      set({ error: 'Failed to load menu items' });
      console.error('Error loading menu items:', error);
    } finally {
      set({ menuLoading: false });
    }
  },

  fetchAggregatorMenu: async (aggregator: string) => {
    try {
      set({ menuLoading: true, error: null });
      const items = await getAggregatorMenu(aggregator);
      
      const menuItems: MenuItem[] = items.map((item: any) => ({
        ...item,
        id: item.item,
        name: item.item_name,
        image: item.item_image || null,
        price: typeof item.rate === 'string' ? parseFloat(item.rate) : item.rate || 0,
        category: item.course
      }));

      set({ menuItems, menuLoading: false });
    } catch (error) {
      set({ error: 'Failed to load aggregator menu', menuLoading: false });
      console.error('Error loading aggregator menu:', error);
    }
  },

  fetchCategories: async () => {
    try {
      const cached = sessionStorage.getItem('menuCategories');
      if (cached) {
        const categories = JSON.parse(cached);
        set({ categories });
        return;
      }

      const courses = await getMenuCourses();
      sessionStorage.setItem('menuCategories', JSON.stringify(courses));
      set({ categories: courses });
    } catch (error) {
      set({ error: 'Failed to load menu categories' });
      throw error;
    }
  },

  fetchPaymentModes: async () => {
    try {
      const modes = await getPaymentModes();
      set({ paymentModes: modes });
    } catch (error) {
      console.error('Failed to fetch payment modes:', error);
    }
  },

  initializeCart: async () => {
    set({ cartId: uuidv4() });
  },

  addToOrder: async (item: OrderItem) => {
    try {
      if (!get().validateQuantity(item.quantity)) {
        throw new CartError(`Quantity must be between ${MIN_QUANTITY} and ${MAX_QUANTITY}`);
      }

      const uniqueId = generateUniqueId(item);
      const existingItemIndex = get().activeOrders.findIndex(orderItem => orderItem.uniqueId === uniqueId);

      if (existingItemIndex !== -1) {
        const existingItem = get().activeOrders[existingItemIndex];
        const newQuantity = existingItem.quantity + item.quantity;
        const newComment = item.comment !== undefined ? item.comment : existingItem?.comment || "";

        if (!get().validateQuantity(newQuantity)) {
          throw new CartError(`Cannot add item. Total quantity would exceed ${MAX_QUANTITY}`);
        }

        const newOrders = [...get().activeOrders];
        newOrders[existingItemIndex] = {
          ...existingItem,
          quantity: newQuantity,
          comment: newComment
        };
        
        set({ activeOrders: newOrders });
      } else {
        const newOrders = [...get().activeOrders, { ...item, uniqueId }];
        set({ activeOrders: newOrders });
      }
    } catch (error) {
      if (error instanceof CartError) {
        set({ error: error.message });
      } else {
        set({ error: 'Failed to add item to cart' });
      }
    }
  },

  removeFromOrder: async (uniqueId: string) => {
    try {
      const newOrders = get().activeOrders.filter(item => item.uniqueId !== uniqueId);
      set({ activeOrders: newOrders });
    } catch (error) {
      set({ error: 'Failed to remove item from cart' });
    }
  },

  updateQuantity: async (uniqueId: string, quantity: number) => {
    try {
      if (!get().validateQuantity(quantity)) {
        throw new CartError(`Quantity must be between ${MIN_QUANTITY} and ${MAX_QUANTITY}`);
      }

      const newOrders = get().activeOrders.map(item =>
        item.uniqueId === uniqueId ? { ...item, quantity } : item
      );
      set({ activeOrders: newOrders });
    } catch (error) {
      if (error instanceof CartError) {
        set({ error: error.message });
      } else {
        set({ error: 'Failed to update quantity' });
      }
    }
  },

  clearOrder: async () => {
    try {
      set({ activeOrders: [] });
    } catch (error) {
      set({ error: 'Failed to clear cart' });
    }
  },

  setSelectedCategory: (category) => set({ selectedCategory: category }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedCustomer: (customer) => set({ selectedCustomer: customer }),
  setSelectedTable: (table: string | null, room: string | null, doNotLoadOrder: boolean = false) => {
    set({ selectedTable: table, selectedRoom: room });
    if (table ) {
      if (!doNotLoadOrder) 
        get().loadTableOrder(table);
    } else {
      get().clearTableOrder();
    }
    if (room) {
      get().fetchMenuItems();
    }
  },
  setSelectedOrderType: (type) => {
    const { fetchMenuItems } = get();
    
    set({ 
          selectedOrderType: type,
          orderId: null
    });
    
    if (type !== 'Aggregators') {
      fetchMenuItems();
    }
  },
  setQuickFilter: (filter) => set({ quickFilter: filter }),
  setSelectedItem: (item) => set({ selectedItem: item }),
  setSelectedAggregator: (aggregator) => set({ selectedAggregator: aggregator }),
  setOrderComment: (comment: string) => set({ orderComment: comment }),

  processPayment: async (paymentMode: string, amount: number) => {
    try {
      const { cartId, selectedCustomer, selectedOrderType } = get();
      
      const order: Order = {
        id: uuidv4(),
        cartId: cartId!,
        customerId: selectedCustomer?.id,
        paymentModeId: paymentMode,
        paymentMode,
        orderType: selectedOrderType,
        status: 'paid',
        totalAmount: amount,
        paidAmount: amount,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const newOrders = [...get().orders, order];
      set({ orders: newOrders });
      
      await get().clearOrder();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  updateOrderStatus: async (orderId: string, status: Order['status']) => {
    try {
      const newOrders = get().orders.map(order => 
        order.id === orderId 
          ? { ...order, status, updatedAt: new Date().toISOString() }
          : order
      );
      set({ orders: newOrders });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  fetchCustomerGroups: async () => {
    const cached = sessionStorage.getItem('customerGroups');
    if (cached) {
      set({ customerGroups: JSON.parse(cached) });
      return;
    }
    const groups = await getCustomerGroups();
    const names = groups.map((g: any) => g.name);
    set({ customerGroups: names });
    sessionStorage.setItem('customerGroups', JSON.stringify(names));
  },

  fetchTerritories: async () => {
    const cached = sessionStorage.getItem('territories');
    if (cached) {
      set({ territories: JSON.parse(cached) });
      return;
    }
    const terrs = await getCustomerTerritories();
    const names = terrs.map((t: any) => t.name);
    set({ territories: names });
    sessionStorage.setItem('territories', JSON.stringify(names));
  },

  getCartTotals: (): CartTotals => {
    const items = get().activeOrders;
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    
    const subtotal = items.reduce((sum, item) => {
      const itemPrice = calculateItemPrice(item);
      return sum + (itemPrice * item.quantity);
    }, 0);

    const tax = items.reduce((sum, item) => {
      const itemPrice = calculateItemPrice(item);
      const taxRate = item.tax_rate || 0;
      return sum + (itemPrice * item.quantity * (taxRate / 100));
    }, 0);

    return {
      subtotal,
      tax,
      total: subtotal + tax,
      itemCount
    };
  },

  itemExistsInCart: (uniqueId: string): boolean => {
    return get().activeOrders.some(item => item.uniqueId === uniqueId);
  },

  validateQuantity: (quantity: number): boolean => {
    return !isNaN(quantity) && quantity >= MIN_QUANTITY && quantity <= MAX_QUANTITY;
  },

  getItemPrice: (item: OrderItem): number => {
    return calculateItemPrice(item);
  },

  getItemQuantityFromCart: (item: MenuItem): number => {
    const uniqueId = generateUniqueId(item as OrderItem);
    const cartItem = get().activeOrders.find(orderItem => orderItem.uniqueId === uniqueId);
    return cartItem?.quantity || 0;
  },

  loadTableOrder: async (table: string) => {
    try {
      set({ orderLoading: true, error: null });
      const response = await getTableOrder(table);
      const order = response.message;
      if (order && order.name && order.items && order.items.length > 0) {
        const orderItems: OrderItem[] = order.items.map(item => {
          const orderItem = {
            id: item.item_code,
            name: item.item_name,
            price: item.rate,
            quantity: item.qty,
            amount: item.amount,
            image: item.image || null,
            item: item.item_code,
            item_name: item.item_name,
            item_image: null,
            course: '',
            description: item.description || '',
            special_dish: 0 as 0 | 1,
            tax_rate: 0,
            comment: item.comment || '',
          };
          return {
            ...orderItem,
            uniqueId: generateUniqueId(orderItem as OrderItem)
          } as OrderItem;
        });

        set({ 
          tableOrder: response,
          activeOrders: orderItems,
          selectedCustomer: order.customer ? {
            id: order.customer,
            name: order.customer_name,
            phone: order.mobile_number,
          } : null,
          isUpdatingOrder: true,
          orderId: order.name,
          originalCartHash: generateCartHash({ activeOrders: orderItems, selectedCustomer: order.customer ? { id: order.customer } as any : null, orderComment: '' }),
        });
      } else {
        set({ 
          tableOrder: null,
                                        });
      }
    } catch (error) {
      set({ 
        error: 'Failed to load table order',
        tableOrder: null,
                              });
    } finally {
      set({ orderLoading: false });
    }
  },

  clearTableOrder: () => {
    set({ 
      tableOrder: null,
                    });
  },

  setOrderForUpdate: (orderId: string | null) => {
    set({ 
      isUpdatingOrder: orderId !== null,
      orderId,
    });
  },

  resetOrderState: () => {
    const state = get();
    const { fetchMenuItems } = state;
    
    const newTabOrder = state.tabOrder.filter(t => t.id !== state.activeTabId);
    const newHeldTabs = { ...state.heldTabs };
    delete newHeldTabs[state.activeTabId];

    if (newTabOrder.length > 0) {
      const targetTab = newTabOrder[newTabOrder.length - 1];
      const targetTabState = newHeldTabs[targetTab.id];
      
      set({
        tabOrder: newTabOrder,
        activeTabId: targetTab.id,
        heldTabs: newHeldTabs,
        activeOrders: targetTabState.activeOrders,
        selectedCustomer: targetTabState.selectedCustomer,
        selectedOrderType: targetTabState.selectedOrderType,
        selectedTable: targetTabState.selectedTable,
        selectedRoom: targetTabState.selectedRoom,
        selectedAggregator: targetTabState.selectedAggregator,
        orderId: targetTabState.orderId,
        isUpdatingOrder: targetTabState.isUpdatingOrder,
        orderComment: targetTabState.orderComment,
        originalCartHash: targetTabState.originalCartHash,
        selectedItem: null,
        orderLoading: false,
        error: null,
      });
    } else {
      const newTabId = uuidv4();
      
      set({
        tabOrder: [{ id: newTabId, name: 'Tab 1' }],
        activeTabId: newTabId,
        heldTabs: {},
        nextTabNumber: 2,
        activeOrders: [],
        selectedCustomer: null,
        selectedOrderType: DEFAULT_ORDER_TYPE,
        selectedTable: null,
        selectedRoom: null,
        selectedAggregator: null,
        orderId: null,
        isUpdatingOrder: false,
        orderComment: '',
        originalCartHash: '',
        selectedItem: null,
        orderLoading: false,
        error: null,
      });
    }

    fetchMenuItems();
  },

  addTab: () => {
    const state = get();
    const currentTabState: OrderTabState = {
      activeOrders: state.activeOrders,
      selectedCustomer: state.selectedCustomer,
      selectedOrderType: state.selectedOrderType,
      selectedTable: state.selectedTable,
      selectedRoom: state.selectedRoom,
      selectedAggregator: state.selectedAggregator,
      orderId: state.orderId,
      isUpdatingOrder: state.isUpdatingOrder,
      orderComment: state.orderComment,
      originalCartHash: state.originalCartHash,
    };
    
    const newTabId = uuidv4();
    const newTabName = `Order ${state.nextTabNumber}`;
    
    set({
      activeTabId: newTabId,
      tabOrder: [...state.tabOrder, { id: newTabId, name: newTabName }],
      nextTabNumber: state.nextTabNumber + 1,
      heldTabs: { ...state.heldTabs, [state.activeTabId]: currentTabState },
      activeOrders: [],
      selectedCustomer: null,
      selectedOrderType: DEFAULT_ORDER_TYPE,
      selectedTable: null,
      selectedRoom: null,
      selectedAggregator: null,
      orderId: null,
      isUpdatingOrder: false,
      orderComment: '',
      originalCartHash: '',
    });
  },

  reorderTabs: (sourceIndex: number, destinationIndex: number) => {
    const state = get();
    if (
      sourceIndex < 0 ||
      sourceIndex >= state.tabOrder.length ||
      destinationIndex < 0 ||
      destinationIndex >= state.tabOrder.length
    ) {
      return;
    }
    const newTabOrder = [...state.tabOrder];
    const [movedTab] = newTabOrder.splice(sourceIndex, 1);
    newTabOrder.splice(destinationIndex, 0, movedTab);
    
    set({ tabOrder: newTabOrder });
  },

  switchTab: (tabId: string) => {
    const state = get();
    if (state.activeTabId === tabId) return;

    const currentTabState: OrderTabState = {
      activeOrders: state.activeOrders,
      selectedCustomer: state.selectedCustomer,
      selectedOrderType: state.selectedOrderType,
      selectedTable: state.selectedTable,
      selectedRoom: state.selectedRoom,
      selectedAggregator: state.selectedAggregator,
      orderId: state.orderId,
      isUpdatingOrder: state.isUpdatingOrder,
      orderComment: state.orderComment,
      originalCartHash: state.originalCartHash,
    };

    const newHeldTabs = { ...state.heldTabs, [state.activeTabId]: currentTabState };
    const targetTabState = newHeldTabs[tabId];

    set({
      activeTabId: tabId,
      heldTabs: newHeldTabs,
      activeOrders: targetTabState.activeOrders,
      selectedCustomer: targetTabState.selectedCustomer,
      selectedOrderType: targetTabState.selectedOrderType,
      selectedTable: targetTabState.selectedTable,
      selectedRoom: targetTabState.selectedRoom,
      selectedAggregator: targetTabState.selectedAggregator,
      orderId: targetTabState.orderId,
      isUpdatingOrder: targetTabState.isUpdatingOrder,
      orderComment: targetTabState.orderComment,
        originalCartHash: targetTabState.originalCartHash,
    });
  },

  closeTab: (tabId: string) => {
    const state = get();
    const { fetchMenuItems } = state;
    const newTabOrder = state.tabOrder.filter(t => t.id !== tabId);
    const newHeldTabs = { ...state.heldTabs };
    delete newHeldTabs[tabId];

    if (newTabOrder.length === 0) {
      // No tabs remain — create a fresh Tab 1
      const newTabId = uuidv4();
      set({
        tabOrder: [{ id: newTabId, name: 'Tab 1' }],
        activeTabId: newTabId,
        heldTabs: {},
        nextTabNumber: 2,
        activeOrders: [],
        selectedCustomer: null,
        selectedOrderType: DEFAULT_ORDER_TYPE,
        selectedTable: null,
        selectedRoom: null,
        selectedAggregator: null,
        orderId: null,
        isUpdatingOrder: false,
        orderComment: '',
        originalCartHash: '',
        selectedItem: null,
        orderLoading: false,
        error: null,
      });
      fetchMenuItems();
      return;
    }

    if (state.activeTabId === tabId) {
      // Closing the active tab — switch to the nearest remaining tab
      const closedIndex = state.tabOrder.findIndex(t => t.id === tabId);
      const targetIndex = Math.min(closedIndex, newTabOrder.length - 1);
      const targetTab = newTabOrder[targetIndex];
      const targetTabState = newHeldTabs[targetTab.id];

      set({
        tabOrder: newTabOrder,
        activeTabId: targetTab.id,
        heldTabs: newHeldTabs,
        activeOrders: targetTabState.activeOrders,
        selectedCustomer: targetTabState.selectedCustomer,
        selectedOrderType: targetTabState.selectedOrderType,
        selectedTable: targetTabState.selectedTable,
        selectedRoom: targetTabState.selectedRoom,
        selectedAggregator: targetTabState.selectedAggregator,
        orderId: targetTabState.orderId,
        isUpdatingOrder: targetTabState.isUpdatingOrder,
        orderComment: targetTabState.orderComment,
        originalCartHash: targetTabState.originalCartHash,
        selectedItem: null,
        orderLoading: false,
        error: null,
      });
    } else {
      // Closing an inactive tab — just remove it
      set({ tabOrder: newTabOrder, heldTabs: newHeldTabs });
    }
  },

  openDraftOrderInNewTab: (draft) => {
    const state = get();

    // Check if this draft order is already open in any tab
    // Check active tab first
    if (state.orderId === draft.orderId) {
      // Already the active tab — nothing to do
      return;
    }
    // Check held tabs
    const existingTabEntry = Object.entries(state.heldTabs).find(
      ([, tabState]) => tabState.orderId === draft.orderId
    );
    if (existingTabEntry) {
      // Switch to the existing tab that already has this draft order
      const [existingTabId] = existingTabEntry;
      const currentTabState: OrderTabState = {
        activeOrders: state.activeOrders,
        selectedCustomer: state.selectedCustomer,
        selectedOrderType: state.selectedOrderType,
        selectedTable: state.selectedTable,
        selectedRoom: state.selectedRoom,
        selectedAggregator: state.selectedAggregator,
        orderId: state.orderId,
        isUpdatingOrder: state.isUpdatingOrder,
        orderComment: state.orderComment,
      originalCartHash: state.originalCartHash,
      };
      const newHeldTabs = { ...state.heldTabs, [state.activeTabId]: currentTabState };
      const targetTabState = newHeldTabs[existingTabId];
      set({
        activeTabId: existingTabId,
        heldTabs: newHeldTabs,
        activeOrders: targetTabState.activeOrders,
        selectedCustomer: targetTabState.selectedCustomer,
        selectedOrderType: targetTabState.selectedOrderType,
        selectedTable: targetTabState.selectedTable,
        selectedRoom: targetTabState.selectedRoom,
        selectedAggregator: targetTabState.selectedAggregator,
        orderId: targetTabState.orderId,
        isUpdatingOrder: targetTabState.isUpdatingOrder,
        orderComment: targetTabState.orderComment,
        originalCartHash: targetTabState.originalCartHash,
      });
      return;
    }

    // Save the current active tab into heldTabs
    const currentTabState: OrderTabState = {
      activeOrders: state.activeOrders,
      selectedCustomer: state.selectedCustomer,
      selectedOrderType: state.selectedOrderType,
      selectedTable: state.selectedTable,
      selectedRoom: state.selectedRoom,
      selectedAggregator: state.selectedAggregator,
      orderId: state.orderId,
      isUpdatingOrder: state.isUpdatingOrder,
      orderComment: state.orderComment,
      originalCartHash: state.originalCartHash,
    };

    // Create a new tab for the draft order
    const newTabId = uuidv4();
    const newTabName = `Order ${state.nextTabNumber}`;

    set({
      activeTabId: newTabId,
      tabOrder: [...state.tabOrder, { id: newTabId, name: newTabName }],
      nextTabNumber: state.nextTabNumber + 1,
      heldTabs: { ...state.heldTabs, [state.activeTabId]: currentTabState },
      // Populate the new tab with the draft order's data
      activeOrders: draft.items,
      selectedCustomer: draft.customer,
      selectedOrderType: draft.orderType,
      selectedTable: draft.table,
      selectedRoom: draft.room,
      selectedAggregator: null,
      orderId: draft.orderId,
      isUpdatingOrder: true,
      orderComment: '',
      originalCartHash: generateCartHash({ activeOrders: draft.items, selectedCustomer: draft.customer, orderComment: '' }),
      selectedItem: null,
      error: null,
    });
  },

  isMenuInteractionDisabled: () => {

    const state = get();
    return state.menuLoading || state.profileLoading;
  },

  isOrderInteractionDisabled: () => {
    const state = get();
    return state.orderLoading;
  }
})); 
usePOSStore.subscribe((state) => {
  if (state.isInitializing) return;

  const dataToSave = {
    tabOrder: state.tabOrder,
    activeTabId: state.activeTabId,
    nextTabNumber: state.nextTabNumber,
    heldTabs: state.heldTabs,
    activeTabState: {
      activeOrders: state.activeOrders,
      selectedCustomer: state.selectedCustomer,
      selectedOrderType: state.selectedOrderType,
      selectedTable: state.selectedTable,
      selectedRoom: state.selectedRoom,
      selectedAggregator: state.selectedAggregator,
      orderId: state.orderId,
      isUpdatingOrder: state.isUpdatingOrder,
      orderComment: state.orderComment,
      originalCartHash: state.originalCartHash,
    }
  };
  localStorage.setItem('posOrderTabsData', JSON.stringify(dataToSave));
});
