/**
 * Kiosk App - Main Application Component
 * 
 * Self-service kiosk ordering system with:
 * - 90-second inactivity timeout
 * - Large touch targets (min 64px)
 * - Haptic visual feedback
 * - Auto-reset to attract screen
 */

import { useState, useCallback, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Hooks
import { useKiosk } from '@/hooks';

// Menu hooks
import { usePublicMenu } from '@ury/menu';

// Order hooks
import { useCreateOrder } from '@ury/order';

// Cart
import { CartItem } from '@ury/cart';

// Pages
import {
  AttractScreen,
  MenuScreen,
  ItemDetailScreen,
  CheckoutScreen,
  ConfirmationScreen,
} from '@/pages';

// Components
import { InactivityWarning } from '@/components/InactivityWarning';
import { DeviceSetup } from '@/components/DeviceSetup';

function App() {
  const [orderResult, setOrderResult] = useState<{
    orderToken: string;
    invoiceId: string;
    grandTotal: number;
  } | null>(null);

  // Kiosk state management
  const kiosk = useKiosk({
    inactivityTimeoutMs: 90 * 1000, // 90 seconds
    inactivityWarningMs: 10 * 1000, // 10 second warning
  });

  // Fetch menu data
  const { menu, loading: menuLoading, error: menuError } = usePublicMenu(
    kiosk.config?.restaurant || '',
    kiosk.orderType || undefined
  );

  // Order creation
  const { createOrder, loading: orderLoading } = useCreateOrder();

  // Extract unique categories from menu
  const categories = useMemo(() => {
    const categorySet = new Set<string>();
    menu.forEach(item => {
      if (item.course) {
        categorySet.add(item.course);
      }
    });
    return Array.from(categorySet).sort();
  }, [menu]);

  // Handle add to cart
  const handleAddToCart = useCallback((item: typeof menu[0], quantity: number, comment: string) => {
    try {
      kiosk.cart.addItem({
        id: item.item,
        name: item.item_name,
        price: item.rate,
        quantity,
        image: item.item_image,
        description: item.description,
        comment: comment || undefined,
      });

      toast.success(`Added ${quantity}x ${item.item_name} to cart`, {
        position: 'bottom-center',
        autoClose: 2000,
        hideProgressBar: true,
        closeOnClick: true,
        pauseOnHover: false,
        draggable: false,
        className: 'kiosk-toast',
      });
    } catch (err) {
      toast.error('Failed to add item to cart', {
        position: 'bottom-center',
        className: 'kiosk-toast',
      });
    }
  }, [kiosk.cart]);

  // Handle place order
  const handlePlaceOrder = useCallback(async () => {
    if (!kiosk.config || !kiosk.orderType) return;

    try {
      const cartItems = kiosk.cart.items;
      if (cartItems.length === 0) {
        toast.error('Your cart is empty');
        return;
      }

      const result = await createOrder({
        restaurant: kiosk.config.restaurant,
        items: cartItems.map((item: CartItem) => ({
          item_code: item.id,
          item_name: item.name,
          qty: item.quantity,
          rate: item.price,
          comment: item.comment,
        })),
        customer_phone: kiosk.customerPhone || undefined,
        order_type: kiosk.orderType,
        order_source: 'Kiosk',
        comments: `Kiosk order - ${kiosk.orderType}`,
      });

      setOrderResult({
        orderToken: result.order_token,
        invoiceId: result.invoice_id,
        grandTotal: result.grand_total,
      });

      kiosk.setLastOrderToken(result.order_token);
      kiosk.goToConfirmation();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to place order';
      toast.error(message, {
        position: 'bottom-center',
        className: 'kiosk-toast',
      });
    }
  }, [kiosk, createOrder]);

  // Show device setup if not configured
  if (!kiosk.isConfigured) {
    return (
      <>
        <DeviceSetup onConfigured={kiosk.resetToAttract} />
        <ToastContainer limit={3} />
      </>
    );
  }

  // Show loading state
  if (menuLoading) {
    return (
      <div className="fixed inset-0 bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="kiosk-spinner mx-auto mb-4" />
          <p className="text-xl text-gray-600">Loading menu...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (menuError) {
    return (
      <div className="fixed inset-0 bg-gray-50 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-foreground mb-4">Unable to Load Menu</h2>
          <p className="text-gray-600 mb-6">{menuError}</p>
          <button
            onClick={() => window.location.reload()}
            className="kiosk-btn-primary"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Inactivity warning overlay */}
      <InactivityWarning
        isVisible={kiosk.inactivityWarning}
        onContinue={kiosk.resetToAttract}
      />

      {/* Main content */}
      <AnimatePresence mode="wait">
        {kiosk.currentView === 'attract' && (
          <AttractScreen
            key="attract"
            restaurantName={kiosk.config?.restaurantName || 'Restaurant'}
            logo={kiosk.config?.logo}
            onStart={kiosk.goToMenu}
          />
        )}

        {kiosk.currentView === 'menu' && (
          <MenuScreen
            key="menu"
            menu={menu}
            categories={categories}
            selectedCategory={kiosk.selectedCategory}
            cartItems={kiosk.cart.items}
            cartTotal={kiosk.cart.getTotals().total}
            itemCount={kiosk.cart.items.reduce((sum, item) => sum + item.quantity, 0)}
            onSelectCategory={kiosk.selectCategory}
            onSelectItem={kiosk.goToItemDetail}
            onUpdateQuantity={kiosk.cart.updateQuantity}
            onRemoveItem={kiosk.cart.removeItem}
            onCheckout={kiosk.goToCheckout}
            onBack={kiosk.resetToAttract}
          />
        )}

        {kiosk.currentView === 'item-detail' && kiosk.selectedItem && (
          <ItemDetailScreen
            key="item-detail"
            item={kiosk.selectedItem}
            onClose={kiosk.backToMenu}
            onAddToCart={handleAddToCart}
          />
        )}

        {kiosk.currentView === 'checkout' && (
          <CheckoutScreen
            key="checkout"
            cartItems={kiosk.cart.items}
            cartTotal={kiosk.cart.getTotals().total}
            selectedOrderType={kiosk.orderType}
            customerPhone={kiosk.customerPhone}
            onSelectOrderType={kiosk.setOrderType}
            onPhoneChange={kiosk.setCustomerPhone}
            onPlaceOrder={handlePlaceOrder}
            onBack={kiosk.backToMenu}
            isSubmitting={orderLoading}
          />
        )}

        {kiosk.currentView === 'confirmation' && orderResult && (
          <ConfirmationScreen
            key="confirmation"
            orderToken={orderResult.orderToken}
            orderNumber={orderResult.invoiceId.split('-').pop() || orderResult.orderToken.slice(-4)}
            total={orderResult.grandTotal}
            orderType={kiosk.orderType || 'Take Away'}
            restaurantName={kiosk.config?.restaurantName || 'Restaurant'}
            onReset={kiosk.resetToAttract}
          />
        )}
      </AnimatePresence>

      {/* Toast notifications */}
      <ToastContainer
        position="bottom-center"
        autoClose={2000}
        hideProgressBar
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss={false}
        draggable={false}
        pauseOnHover={false}
        theme="light"
        limit={3}
      />
    </>
  );
}

export default App;
