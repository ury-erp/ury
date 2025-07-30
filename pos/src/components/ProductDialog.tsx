import React, { useState, useEffect, useRef, ChangeEvent } from 'react';
import { X, Plus, Minus } from 'lucide-react';
import { OrderItem, usePOSStore } from '../store/pos-store';
import { cn, formatCurrency } from '../lib/utils';
import { Button, Dialog, DialogContent, Input } from './ui';
import { db } from '../lib/frappe-sdk';

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
    activeOrders,
    menuItems
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

  // State for the full item doc (used for all dialog content)
  const [itemDoc, setItemDoc] = useState<any | null>(null);
  const [isItemLoading, setIsItemLoading] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);

  // Fetch Item doc when dialog opens or selectedItem changes
  useEffect(() => {
    if (!selectedItem) {
      setItemDoc(null);
      setItemError(null);
      setIsItemLoading(false);
      return;
    }
    setIsItemLoading(true);
    setItemError(null);
    db.getDoc('Item', selectedItem.item)
      .then((doc: any) => {
        setItemDoc(doc);
      })
      .catch(() => {
        setItemError('Failed to fetch item details');
        setItemDoc(null);
      })
      .finally(() => {
        setIsItemLoading(false);
      });
  }, [selectedItem]);

  
  const addonDetails = Array.isArray(itemDoc?.custom_pos_add_on_items)
    ? itemDoc.custom_pos_add_on_items
        .map((entry: any) => {
          const menuAddon = menuItems.find((menuItem: any) => menuItem.item === entry.item);
          return menuAddon
            ? {
                id: menuAddon.item,
                name: menuAddon.item_name,
                price: Number(menuAddon.price)
              }
            : {
                id: entry.item,
                name: entry.item,
                price: 0
              };
        })
        .filter(Boolean)
    : [];

  const variantDetails = Array.isArray(itemDoc?.custom_pos_item_variants)
    ? itemDoc.custom_pos_item_variants
        .map((entry: any) => {
          const menuVariant = menuItems.find((menuItem: any) => menuItem.item === entry.item);
          return menuVariant
            ? {
                id: menuVariant.item,
                name: menuVariant.item_name,
                price: Number(menuVariant.price)
              }
            : {
                id: entry.item,
                name: entry.item,
                price: 0
              };
        })
        .filter(Boolean)
    : [];

  const [selectedAddons, setSelectedAddons] = useState<Array<{ id: string; name: string; price: number }>>([]);
  const [quantity, setQuantity] = useState<string>(editMode ? initialQuantity?.toString() || '0' : '0');
  const [comments, setComments] = useState<string>(itemToReplace?.comment || existingCartItem?.comment || '');
  const dialogRef = useRef<HTMLDivElement>(null);

  const [addonItemCodes, setAddonItemCodes] = useState<string[]>([]);
  const [isAddonLoading, setIsAddonLoading] = useState(false);
  const [addonError, setAddonError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedItem) {
      setAddonItemCodes([]);
      setAddonError(null);
      setIsAddonLoading(false);
      return;
    }
    setIsAddonLoading(true);
    setAddonError(null);
    db.getDoc('Item', selectedItem.item)
      .then((doc: any) => {
        if (Array.isArray(doc.custom_pos_add_on_items)) {
          const codes = doc.custom_pos_add_on_items
            .map((entry: any) => entry.item)
            .filter(Boolean);
          setAddonItemCodes(codes);
        } else {
          setAddonItemCodes([]);
        }
      })
      .catch((err: any) => {
        setAddonError('Failed to fetch add-ons');
        setAddonItemCodes([]);
      })
      .finally(() => {
        setIsAddonLoading(false);
      });
  }, [selectedItem]);

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

  // Always get price from menuItems for the main item
  const basePrice = selectedItem?.price ? Number(selectedItem.price) : 0;
  const numericQuantity = quantity === '' ? 0 : parseInt(quantity, 10);
  const addonsTotal = selectedAddons.reduce((sum, addon) => sum + addon.price, 0);
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
    const numericQuantity = typeof quantity === 'string' ? parseInt(quantity, 10) : quantity;
    if (isNaN(numericQuantity) || numericQuantity === 0) {
      return; // Don't add to order if quantity is 0 or invalid
    }

    if (editMode && itemToReplace?.uniqueId) {
      // Remove the old item first
      removeFromOrder(itemToReplace.uniqueId);
    }

    // Add main item as a cart line
    const orderItem: OrderItem = {
      ...selectedItem,
      quantity: numericQuantity,
      price: basePrice
    };
    addToOrder(orderItem);

    // Add each selected add-on as a separate cart line
    selectedAddons.forEach(addon => {
      // Find the full menu item details for the add-on
      const menuAddon = menuItems.find(item => item.item === addon.id);
      const addonOrderItem: OrderItem = menuAddon
        ? {
            ...menuAddon,
            quantity: numericQuantity,
            price: addon.price
          }
        : {
            id: addon.id,
            name: addon.name,
            price: addon.price,
            quantity: numericQuantity,
            image: null,
            item: addon.id,
            item_name: addon.name,
            course: '',
            description: '',
            special_dish: 0 as 0 | 1,
            tax_rate: 0
          } as OrderItem;
      addToOrder(addonOrderItem);
    });

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

  // Handler to switch to a variant item
  const handleVariantClick = (variantId: string) => {
    const menuVariant = menuItems.find((m: any) => m.item === variantId);
    if (menuVariant) {
      setSelectedItem(menuVariant);
    }
  };

  return (
    <Dialog open={true} onOpenChange={handleClose}>
      <DialogContent 
        ref={dialogRef}
        variant="xlarge"
        className="bg-white w-full max-w-[90rem] max-h-[90vh] overflow-y-auto flex flex-col md:flex-row p-0"
        showCloseButton={false}
      >
        {/* Left Column - Image  */}
        <div className="md:w-1/3 relative">
          {itemDoc?.image ? (
            <img
              src={itemDoc.image}
              alt={itemDoc.name}
              className="w-full min-h-96 h-full object-cover rounded-t-lg md:rounded-l-lg md:rounded-tr-none filter saturate-75 brightness-95"
              style={{ filter: 'saturate(0.7) brightness(0.95)' }}
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent) {
                  const placeholder = document.createElement('div');
                  placeholder.className = 'w-full h-96 bg-gray-200 flex items-center justify-center text-[8rem] text-gray-400 font-medium rounded-t-lg md:rounded-l-lg md:rounded-tr-none';
                  placeholder.textContent = itemDoc.name.slice(0, 2).toUpperCase();
                  parent.insertBefore(placeholder, target);
                }
              }}
            />
          ) : (
            <div className="w-full min-h-96 h-full bg-gray-200 flex items-center justify-center text-[8rem] text-gray-400 font-medium rounded-t-lg md:rounded-l-lg md:rounded-tr-none">
              {itemDoc?.name.slice(0, 2).toUpperCase()}
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
            <h2 className="text-2xl font-bold text-gray-900">{selectedItem?.item_name}</h2>
            <p className="text-sm text-gray-500 mt-1">{selectedItem?.item}</p>
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
          {/* Variants Section  */}
          {variantDetails.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-3">Variants</h3>
              <div className="flex gap-2 flex-wrap">
                {variantDetails.map((variant: any) => {
                  const menuVariant = menuItems.find((m: any) => m.item === variant.id);
                  return (
                    <button
                      key={variant.id}
                      onClick={() => handleVariantClick(variant.id)}
                      className={cn(
                        'p-2 rounded-lg border text-left w-full flex justify-between items-center',
                        variant.id === itemDoc?.item
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-200'
                      )}
                    >
                      <div className="font-medium">{variant.name}</div>
                      <div className="text-sm text-gray-500">{formatCurrency(menuVariant ? Number(menuVariant.price) : 0)}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>


        {/* Right Column - Add-ons and Order Button */}
        <div className="h-auto md:w-1/3 p-6 border-t md:border-t-0 md:border-l border-gray-200 overflow-y-auto flex flex-col">
          <div className="overflow-y-auto mb-6">
            {isAddonLoading ? (
              <div className="mb-6 flex items-center justify-center text-gray-500">Loading add-ons...</div>
            ) : addonError ? (
              <div className="flex items-center justify-center text-red-500">{addonError}</div>
            ) : addonDetails.length > 0 ? (
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3">Add-ons</h3>
                <div className="space-y-2">
                  {addonDetails.map((addon: any) => (
                    <button
                      key={addon.id}
                      onClick={() => handleAddonToggle({ id: addon.id, name: addon.name, price: Number(addon.price) })}
                      className={cn(
                        'w-full p-3 rounded-lg border text-left',
                        selectedAddons.some(item => item.id === addon.id)
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-200'
                      )}
                    >
                      <div className="flex justify-between items-center">
                        <span>{addon.name}</span>
                        <span className="text-sm text-gray-500">+{formatCurrency(Number(addon.price))}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center text-gray-400 text-sm">No add ons</div>
            )}
          </div>
          {/* Always show total section at the end */}
          <div className="mt-auto pt-2 border-t border-gray-200">
            <div className="flex justify-between items-center text-lg font-semibold">
              <span>Total&nbsp;</span>
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