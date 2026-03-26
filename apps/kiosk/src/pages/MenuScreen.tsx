/**
 * Menu Screen - Large touch-friendly cards with category ribbon
 * Shows 4-6 items per screen with large touch targets
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, ChevronRight, Minus, Plus, Trash2 } from 'lucide-react';
import { MenuItem } from '@ury/menu';
import { CartItem } from '@ury/cart';
import { CategoryGroup } from '@/types';

interface MenuScreenProps {
  menu: MenuItem[];
  categories: string[];
  selectedCategory: string | null;
  cartItems: CartItem[];
  cartTotal: number;
  itemCount: number;
  onSelectCategory: (category: string | null) => void;
  onSelectItem: (item: MenuItem) => void;
  onUpdateQuantity: (uniqueId: string, quantity: number) => void;
  onRemoveItem: (uniqueId: string) => void;
  onCheckout: () => void;
  onBack: () => void;
}

export function MenuScreen({
  menu,
  categories,
  selectedCategory,
  cartItems,
  cartTotal,
  itemCount,
  onSelectCategory,
  onSelectItem,
  onUpdateQuantity,
  onRemoveItem,
  onCheckout,
}: MenuScreenProps) {
  const [showCart, setShowCart] = useState(false);

  // Group items by category
  const groupedItems = useMemo<CategoryGroup[]>(() => {
    const groups: Record<string, MenuItem[]> = {};
    
    menu.forEach(item => {
      const category = item.course || 'Other';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(item);
    });

    return Object.entries(groups).map(([name, items]) => ({ name, items }));
  }, [menu]);

  // Filter items by selected category
  const displayedItems = useMemo(() => {
    if (!selectedCategory) {
      return menu.slice(0, 6); // Show first 6 items when no category selected
    }
    return menu.filter(item => item.course === selectedCategory);
  }, [menu, selectedCategory]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-gray-50 flex flex-col"
    >
      {/* Header */}
      <header className="bg-white shadow-sm px-8 py-4 flex items-center justify-between z-20">
        <h2 className="text-3xl font-bold text-foreground">Menu</h2>
        
        {/* Cart button */}
        <button
          onClick={() => setShowCart(true)}
          className="flex items-center gap-3 bg-primary text-white px-6 py-3 rounded-2xl font-semibold text-xl active:scale-95 transition-transform"
        >
          <ShoppingCart className="w-6 h-6" />
          <span>{itemCount}</span>
          <span className="hidden sm:inline">•</span>
          <span className="hidden sm:inline">{formatPrice(cartTotal)}</span>
        </button>
      </header>

      {/* Category ribbon */}
      <div className="bg-white border-b px-6 py-4 overflow-x-auto">
        <div className="flex gap-3 min-w-max">
          <button
            onClick={() => onSelectCategory(null)}
            className={selectedCategory === null ? 'kiosk-category-active' : 'kiosk-category'}
          >
            All
          </button>
          {categories.map(category => (
            <button
              key={category}
              onClick={() => onSelectCategory(category)}
              className={selectedCategory === category ? 'kiosk-category-active' : 'kiosk-category'}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Main content - Menu grid */}
      <div className="flex-1 flex overflow-hidden">
        {/* Menu items grid */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {displayedItems.map((item, index) => (
              <motion.div
                key={item.item}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => onSelectItem(item)}
                className="kiosk-card group"
              >
                {/* Image */}
                <div className="relative h-48 overflow-hidden">
                  {item.item_image ? (
                    <img
                      src={item.item_image}
                      alt={item.item_name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                      <span className="text-gray-400 text-6xl">🍽️</span>
                    </div>
                  )}
                  {/* Price badge */}
                  <div className="absolute top-4 right-4 bg-white px-4 py-2 rounded-full shadow-lg">
                    <span className="text-xl font-bold text-primary">
                      {formatPrice(item.rate)}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-5">
                  <h3 className="text-xl font-bold text-foreground mb-2 line-clamp-2">
                    {item.item_name}
                  </h3>
                  {item.description && (
                    <p className="text-gray-500 text-base line-clamp-2">
                      {item.description}
                    </p>
                  )}
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm text-gray-400 capitalize">
                      {item.course || 'Other'}
                    </span>
                    <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                      <Plus className="w-6 h-6 text-white" />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Cart sidebar */}
        <AnimatePresence>
          {showCart && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowCart(false)}
                className="fixed inset-0 bg-black/50 z-30 lg:hidden"
              />
              
              {/* Cart panel */}
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-40 flex flex-col lg:relative lg:shadow-none lg:border-l"
              >
                {/* Cart header */}
                <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
                  <h3 className="text-2xl font-bold flex items-center gap-3">
                    <ShoppingCart className="w-7 h-7" />
                    Your Order
                    <span className="bg-primary text-white text-base px-3 py-1 rounded-full">
                      {itemCount}
                    </span>
                  </h3>
                  <button
                    onClick={() => setShowCart(false)}
                    className="lg:hidden w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center active:bg-gray-300 transition-colors"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </div>

                {/* Cart items */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {cartItems.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <ShoppingCart className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <p className="text-xl">Your cart is empty</p>
                      <p className="text-base mt-2">Add items to get started</p>
                    </div>
                  ) : (
                    cartItems.map((item) => (
                      <div key={item.uniqueId} className="kiosk-cart-item">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-lg truncate">{item.name}</h4>
                          <p className="text-primary font-bold">
                            {formatPrice(item.price * item.quantity)}
                          </p>
                        </div>
                        
                        {/* Quantity controls */}
                        <div className="kiosk-stepper">
                          <button
                            onClick={() => onUpdateQuantity(item.uniqueId, item.quantity - 1)}
                            className={item.quantity <= 1 ? 'kiosk-stepper-btn-minus' : 'kiosk-stepper-btn'}
                          >
                            {item.quantity <= 1 ? (
                              <Trash2 className="w-6 h-6" />
                            ) : (
                              <Minus className="w-6 h-6" />
                            )}
                          </button>
                          <span className="kiosk-stepper-value">{item.quantity}</span>
                          <button
                            onClick={() => onUpdateQuantity(item.uniqueId, item.quantity + 1)}
                            className="kiosk-stepper-btn"
                          >
                            <Plus className="w-6 h-6" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Cart footer */}
                {cartItems.length > 0 && (
                  <div className="p-6 border-t bg-gray-50 space-y-4">
                    <div className="flex items-center justify-between text-2xl font-bold">
                      <span>Total</span>
                      <span className="text-primary">{formatPrice(cartTotal)}</span>
                    </div>
                    <button
                      onClick={onCheckout}
                      className="kiosk-btn-primary w-full text-2xl py-5"
                    >
                      Checkout
                    </button>
                  </div>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default MenuScreen;
