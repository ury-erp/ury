/**
 * Item Detail Screen - Large image, description, add to cart with big buttons
 * Full-screen modal-like experience for customizing an item
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Minus, Plus, ChevronLeft } from 'lucide-react';
import { MenuItem } from '@ury/menu';
import { Button } from '@ury/ui';

interface ItemDetailScreenProps {
  item: MenuItem;
  onClose: () => void;
  onAddToCart: (item: MenuItem, quantity: number, comment: string) => void;
}

export function ItemDetailScreen({ item, onClose, onAddToCart }: ItemDetailScreenProps) {
  const [quantity, setQuantity] = useState(1);
  const [comment, setComment] = useState('');

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  };

  const totalPrice = item.rate * quantity;

  const handleAdd = () => {
    onAddToCart(item, quantity, comment);
    onClose();
  };

  const increment = () => setQuantity(q => Math.min(q + 1, 99));
  const decrement = () => setQuantity(q => Math.max(q - 1, 1));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col md:flex-row"
        onClick={e => e.stopPropagation()}
      >
        {/* Close button (mobile) */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-12 h-12 bg-white/90 rounded-full flex items-center justify-center shadow-lg md:hidden"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Image section */}
        <div className="w-full md:w-1/2 h-64 md:h-auto relative bg-gray-100">
          {item.item_image ? (
            <img
              src={item.item_image}
              alt={item.item_name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-8xl">🍽️</span>
            </div>
          )}
          
          {/* Back button (desktop) */}
          <button
            onClick={onClose}
            className="hidden md:flex absolute top-6 left-6 items-center gap-2 bg-white/90 px-4 py-3 rounded-2xl font-semibold text-lg shadow-lg hover:bg-white transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            Back
          </button>

          {/* Price badge */}
          <div className="absolute bottom-6 left-6 bg-white px-6 py-3 rounded-2xl shadow-xl">
            <span className="text-3xl font-bold text-primary">{formatPrice(item.rate)}</span>
          </div>
        </div>

        {/* Content section */}
        <div className="flex-1 flex flex-col p-6 md:p-10">
          {/* Header */}
          <div className="mb-6">
            <span className="inline-block px-4 py-1 bg-primary-50 text-primary-700 rounded-full text-sm font-semibold mb-3">
              {item.course || 'Menu Item'}
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
              {item.item_name}
            </h2>
            {item.description ? (
              <p className="text-lg text-gray-600 leading-relaxed">{item.description}</p>
            ) : (
              <p className="text-lg text-gray-400 italic">No description available</p>
            )}
          </div>

          {/* Special dish badge */}
          {item.special_dish ? (
            <div className="mb-6 inline-flex items-center gap-2 bg-amber-50 text-amber-700 px-4 py-2 rounded-xl w-fit">
              <span className="text-xl">⭐</span>
              <span className="font-semibold">Chef's Special</span>
            </div>
          ) : null}

          {/* Quantity selector */}
          <div className="mb-6">
            <label className="text-lg font-semibold text-gray-700 mb-4 block">Quantity</label>
            <div className="flex items-center gap-6">
              <button
                onClick={decrement}
                disabled={quantity <= 1}
                className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center text-3xl font-bold text-gray-700 active:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Minus className="w-8 h-8" />
              </button>
              <span className="text-5xl font-bold text-foreground w-24 text-center">
                {quantity}
              </span>
              <button
                onClick={increment}
                disabled={quantity >= 99}
                className="w-20 h-20 rounded-2xl bg-primary text-white flex items-center justify-center text-3xl font-bold active:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-primary/30"
              >
                <Plus className="w-8 h-8" />
              </button>
            </div>
          </div>

          {/* Comment input */}
          <div className="mb-6">
            <label className="text-lg font-semibold text-gray-700 mb-4 block">
              Special Instructions (Optional)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Any allergies or preferences?"
              className="w-full px-6 py-4 rounded-2xl border-2 border-gray-200 text-xl resize-none focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20 transition-all"
              rows={2}
            />
          </div>

          {/* Add to cart button */}
          <div className="mt-auto pt-6 border-t">
            <button
              onClick={handleAdd}
              className="w-full kiosk-btn-primary text-2xl py-6 flex items-center justify-between px-8"
            >
              <span className="font-bold">Add to Order</span>
              <span className="text-3xl font-bold">{formatPrice(totalPrice)}</span>
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default ItemDetailScreen;
