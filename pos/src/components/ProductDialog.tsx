import React, { useState, useEffect, useRef, ChangeEvent } from 'react';
import { X, Plus, Minus } from 'lucide-react';
import { OrderItem, usePOSStore } from '../store/pos-store';
import { cn, formatCurrency } from '../lib/utils';
import { Button, Dialog, DialogContent, Input } from './ui';

interface Variant {
  id: string;
  name: string;
  price: number;
}

interface Addon {
  id: string;
  name: string;
  price: number;
  category: 'sides' | 'drinks' | 'desserts';
}

interface ProductDialogProps {
  onClose: () => void;
  editMode?: boolean;
  initialVariant?: Variant;
  initialAddons?: Array<Omit<Addon, 'category'>>;
  initialQuantity?: number;
  itemToReplace?: OrderItem;
}

const ProductDialog: React.FC<ProductDialogProps> = ({
  onClose,
  editMode = false,
  initialVariant,
  initialAddons = [],
  initialQuantity,
  itemToReplace
}) => {
  const { 
    selectedItem, 
    addToOrder, 
    removeFromOrder, 
    setSelectedItem, 
    getItemQuantityFromCart,
    activeOrders 
  } = usePOSStore();
  
  // Find existing item in cart
  const existingCartItem = selectedItem ? activeOrders.find(
    order => order.id === selectedItem.id &&
    (!order.selectedVariant || order.selectedVariant.id === initialVariant?.id) &&
    (!order.selectedAddons || order.selectedAddons.length === initialAddons.length && 
      order.selectedAddons.every(addon => 
        initialAddons.some(initAddon => initAddon.id === addon.id)
      ))
  ) : null;

  const [selectedVariant, setSelectedVariant] = useState<Variant | undefined>(initialVariant || selectedItem?.variants?.[0]);
  const [selectedAddons, setSelectedAddons] = useState<Array<Omit<Addon, 'category'>>>(initialAddons);
  const [quantity, setQuantity] = useState<string>(editMode ? initialQuantity?.toString() || '0' : '0');
  const [comments, setComments] = useState<string>(itemToReplace?.comment || existingCartItem?.comment || '');
  const dialogRef = useRef<HTMLDivElement>(null);

  // Initialize quantity and comments from cart if not in edit mode
  useEffect(() => {
    if (!editMode && selectedItem) {
      if (existingCartItem) {
        setQuantity(existingCartItem.quantity.toString());
        setComments(existingCartItem.comment || '');
      } else {
        const cartQuantity = getItemQuantityFromCart(selectedItem);
        setQuantity(cartQuantity.toString());
      }
    }
  }, [selectedItem, editMode, getItemQuantityFromCart, existingCartItem]);

  // Handle click outside to close dialog
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(event.target as Node)) {
        handleClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle escape key to close dialog
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  if (!selectedItem) return null;

  const basePrice = selectedVariant?.price || selectedItem.price;
  const addonsTotal = selectedAddons.reduce((sum, addon) => sum + addon.price, 0);
  const numericQuantity = quantity === '' ? 0 : parseInt(quantity, 10);
  const total = (basePrice + addonsTotal) * numericQuantity;

  const handleQuantityChange = (value: string) => {
    // Allow empty string or numbers
    if (value === '') {
      setQuantity('');
      return;
    }

    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 0 && num <= 99) {
      setQuantity(num.toString());
    }
  };

  const handleIncrement = () => {
    const currentNum = quantity === '' ? 0 : parseInt(quantity, 10);
    if (currentNum < 99) {
      setQuantity((currentNum + 1).toString());
    }
  };

  const handleDecrement = () => {
    const currentNum = quantity === '' ? 0 : parseInt(quantity, 10);
    if (currentNum > 0) {
      setQuantity((currentNum - 1).toString());
    }
  };

  const handleAddToOrder = () => {
    const numericQuantity = parseInt(quantity, 10);
    if (isNaN(numericQuantity) || numericQuantity === 0) {
      return; // Don't add to order if quantity is 0 or invalid
    }

    if (editMode && itemToReplace?.uniqueId) {
      removeFromOrder(itemToReplace.uniqueId);
    } else if (existingCartItem?.uniqueId) {
      removeFromOrder(existingCartItem.uniqueId);
    }

    const orderItem: OrderItem = {
      ...selectedItem,
      quantity: numericQuantity,
      selectedVariant,
      selectedAddons,
      price: basePrice,
      comment: comments.trim()
    };
    addToOrder(orderItem);
    handleClose();
  };

  const handleClose = () => {
    setSelectedItem(null);
    onClose();
  };

  const handleAddonToggle = (addon: Omit<Addon, 'category'>) => {
    setSelectedAddons(current => 
      current.some(item => item.id === addon.id)
        ? current.filter(item => item.id !== addon.id)
        : [...current, addon]
    );
  };

  return (
    <Dialog open={true} onOpenChange={handleClose}>
      <DialogContent 
        ref={dialogRef}
        variant="xlarge"
        className="bg-white w-full max-w-[90rem] max-h-[90vh] flex flex-col md:flex-row p-0"
        showCloseButton={false}
      >
        {/* Left Column - Image and Basic Info */}
        <div className="md:w-1/3 relative">
          {selectedItem.image ? (
            <img
              src={selectedItem.image}
              alt={selectedItem.name}
              className="w-full h-96 object-cover rounded-t-lg md:rounded-l-lg md:rounded-tr-none filter saturate-75 brightness-95"
              style={{ filter: 'saturate(0.7) brightness(0.95)' }}
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent) {
                  const placeholder = document.createElement('div');
                  placeholder.className = 'w-full h-96 bg-gray-200 flex items-center justify-center text-[8rem] text-gray-400 font-medium rounded-t-lg md:rounded-l-lg md:rounded-tr-none';
                  placeholder.textContent = selectedItem.name.slice(0, 2).toUpperCase();
                  parent.insertBefore(placeholder, target);
                }
              }}
            />
          ) : (
            <div className="w-full h-96 bg-gray-200 flex items-center justify-center text-[8rem] text-gray-400 font-medium rounded-t-lg md:rounded-l-lg md:rounded-tr-none">
              {selectedItem.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <Button
            onClick={handleClose}
            variant="outline"
            size="icon"
            className="absolute top-4 right-4 bg-white shadow-lg"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Middle Column - Variants and Quantity */}
        <div className="md:w-1/3 p-6 overflow-y-auto">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{selectedItem.name}</h2>
            <p className="text-sm text-gray-500 mt-1">{selectedItem.item}</p>
          </div>

          {selectedItem.variants && selectedItem.variants.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-3">Choose your size</h3>
              <div className="space-y-2">
                {selectedItem.variants.map((variant: Variant) => (
                  <Button
                    key={variant.id}
                    onClick={() => setSelectedVariant(variant)}
                    variant="outline"
                    className={cn(
                      'w-full p-3 text-left justify-start',
                      selectedVariant?.id === variant.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-blue-200'
                    )}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{variant.name}</span>
                      <span>{formatCurrency(variant.price)}</span>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-3">Quantity</h3>
            <div className="flex items-center space-x-2">
              <Button
                onClick={handleDecrement}
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-full"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                type="number"
                min="0"
                max="99"
                value={quantity}
                onChange={(e) => handleQuantityChange(e.target.value)}
                onBlur={() => {
                  // If empty on blur, set to 0
                  if (quantity === '') {
                    setQuantity('0');
                  }
                }}
                className="w-16 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <Button
                onClick={handleIncrement}
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-full"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-3">Special Instructions</h3>
            <Input
              placeholder="Add any special instructions or notes for this item..."
              value={comments}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setComments(e.target.value)}
              className="resize-none"
            />
          </div>
        </div>

        {/* Right Column - Add-ons and Order Button */}
        <div className="md:w-1/3 p-6 border-t md:border-t-0 md:border-l border-gray-200 overflow-y-auto">
          {selectedItem.addons && selectedItem.addons.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Add extras</h3>
              <div className="space-y-4">
                {(['sides', 'drinks', 'desserts'] as const).map(category => {
                  const categoryAddons = selectedItem.addons?.filter(addon => addon.category === category);
                  if (!categoryAddons?.length) return null;

                  return (
                    <div key={category} className="space-y-2">
                      <h4 className="font-medium capitalize">{category}</h4>
                      {categoryAddons.map((addon: Addon) => (
                        <Button
                          key={addon.id}
                          onClick={() => handleAddonToggle(addon)}
                          variant="outline"
                          className={cn(
                            'w-full p-3 text-left justify-start',
                            selectedAddons.some(item => item.id === addon.id)
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-blue-200'
                          )}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-medium">{addon.name}</span>
                            <span>{formatCurrency(addon.price)}</span>
                          </div>
                        </Button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-6">
            <div className="flex justify-between items-center text-lg font-semibold">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
            <Button
              onClick={handleAddToOrder}
              className="w-full mt-4"
              size="lg"
              disabled={numericQuantity === 0}
            >
              {editMode || existingCartItem ? 'Update Order' : 'Add to Order'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProductDialog; 