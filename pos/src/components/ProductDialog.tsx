import React, { useEffect, useMemo, useState } from 'react';
import { ProductConfigurator } from '@ury/ui';
import { formatCurrency, db } from '@ury/core';
import { OrderItem, usePOSStore } from '../store/pos-store';
import { t } from '../i18n';

interface ProductDialogProps {
  onClose: () => void;
  editMode?: boolean;
  initialVariant?: { id: string; name: string; price: number };
  initialAddons?: Array<{ id: string; name: string; price: number }>;
  initialQuantity?: number;
  itemToReplace?: OrderItem;
}

const ProductDialog: React.FC<ProductDialogProps> = ({
  onClose,
  editMode = false,
  initialAddons = [],
  initialQuantity,
  itemToReplace,
}) => {
  const {
    selectedItem,
    addToOrder,
    removeFromOrder,
    setSelectedItem,
    getItemQuantityFromCart,
    activeOrders,
    menuItems,
  } = usePOSStore();

  const existingCartItem = selectedItem
    ? activeOrders.find(
        (order) =>
          order.id === selectedItem.id &&
          (!order.selectedAddons ||
            (order.selectedAddons.length === initialAddons.length &&
              order.selectedAddons.every((addon) =>
                initialAddons.some((initAddon) => initAddon.id === addon.id)
              )))
      )
    : null;

  const [itemDoc, setItemDoc] = useState<Record<string, unknown> | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<Array<{ id: string; name: string; price: number }>>(
    initialAddons
  );
  const [quantity, setQuantity] = useState<string>(
    editMode ? initialQuantity?.toString() || '0' : '0'
  );
  const [comments, setComments] = useState<string>(
    itemToReplace?.comment || existingCartItem?.comment || ''
  );
  const [addonsLoading, setAddonsLoading] = useState(false);
  const [addonsError, setAddonsError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedItem) {
      setItemDoc(null);
      return;
    }
    setAddonsLoading(true);
    setAddonsError(null);
    db.getDoc('Item', selectedItem.item)
      .then((doc) => setItemDoc(doc as Record<string, unknown>))
      .catch(() => {
        setAddonsError('Failed to fetch item details');
        setItemDoc(null);
      })
      .finally(() => setAddonsLoading(false));
  }, [selectedItem]);

  useEffect(() => {
    if (!editMode && selectedItem) {
      if (existingCartItem) {
        setQuantity(existingCartItem.quantity.toString());
        setComments(existingCartItem.comment || '');
      } else {
        setQuantity(getItemQuantityFromCart(selectedItem).toString());
      }
    }
  }, [selectedItem, editMode, getItemQuantityFromCart, existingCartItem]);

  const addonDetails = useMemo(() => {
    const rows = Array.isArray(itemDoc?.custom_pos_add_on_items)
      ? (itemDoc.custom_pos_add_on_items as Array<{ item: string }>)
      : [];
    return rows
      .map((entry) => {
        const menuAddon = menuItems.find((menuItem) => menuItem.item === entry.item);
        return menuAddon
          ? { id: menuAddon.item, name: menuAddon.item_name, price: Number(menuAddon.price) }
          : { id: entry.item, name: entry.item, price: 0 };
      })
      .filter(Boolean);
  }, [itemDoc, menuItems]);

  const variantDetails = useMemo(() => {
    const rows = Array.isArray(itemDoc?.custom_pos_item_variants)
      ? (itemDoc.custom_pos_item_variants as Array<{ item: string }>)
      : [];
    return rows.map((entry) => {
      const menuVariant = menuItems.find((menuItem) => menuItem.item === entry.item);
      return menuVariant
        ? { id: menuVariant.item, name: menuVariant.item_name, price: Number(menuVariant.price) }
        : { id: entry.item, name: entry.item, price: 0 };
    });
  }, [itemDoc, menuItems]);

  if (!selectedItem) return null;

  const basePrice = Number(selectedItem.price) || 0;
  const numericQuantity = quantity === '' ? 0 : parseFloat(quantity);
  const addonsTotal = selectedAddons.reduce((sum, addon) => sum + addon.price, 0);
  const total = (basePrice + addonsTotal) * numericQuantity;

  const handleQuantityChange = (value: string) => {
    if (!/^\d*\.?\d*$/.test(value)) return;
    setQuantity(value);
  };

  const handleClose = () => {
    setSelectedItem(null);
    onClose();
  };

  const handleAddToOrder = () => {
    if (isNaN(numericQuantity) || numericQuantity <= 0) return;
    if (editMode && itemToReplace?.uniqueId) removeFromOrder(itemToReplace.uniqueId);

    addToOrder({
      ...selectedItem,
      quantity: numericQuantity,
      price: basePrice,
      comment: comments || undefined,
    });

    selectedAddons.forEach((addon) => {
      const menuAddon = menuItems.find((item) => item.item === addon.id);
      if (menuAddon) {
        addToOrder({ ...menuAddon, quantity: numericQuantity, price: addon.price });
      } else {
        addToOrder({
          id: addon.id,
          name: addon.name,
          price: addon.price,
          quantity: numericQuantity,
          image: null,
          item: addon.id,
          item_name: addon.name,
          course: '',
          description: '',
          special_dish: 0,
          tax_rate: 0,
        } as OrderItem);
      }
    });

    handleClose();
  };

  return (
    <ProductConfigurator
      open
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
      itemName={selectedItem.item_name}
      itemCode={selectedItem.item}
      courseLabel={selectedItem.course_label || selectedItem.course}
      imageUrl={(itemDoc?.image as string | undefined) || selectedItem.image}
      quantity={quantity}
      onQuantityChange={handleQuantityChange}
      onQuantityBlur={() => {
        if (quantity === '') setQuantity('0');
      }}
      onIncrement={() => {
        const current = quantity === '' ? 0 : parseFloat(quantity);
        if (current < 99) setQuantity(String(Math.round((current + 1) * 1000) / 1000));
      }}
      onDecrement={() => {
        const current = quantity === '' ? 0 : parseFloat(quantity);
        if (current > 0) setQuantity(String(Math.round((current - 1) * 1000) / 1000));
      }}
      comments={comments}
      onCommentsChange={setComments}
      variants={variantDetails.map((v) => ({
        id: v.id,
        name: v.name,
        priceLabel: formatCurrency(v.price),
      }))}
      selectedVariantId={(itemDoc?.item as string | undefined) || selectedItem.item}
      onSelectVariant={(id) => {
        const menuVariant = menuItems.find((m) => m.item === id);
        if (menuVariant) setSelectedItem(menuVariant);
      }}
      addons={addonDetails.map((a) => ({
        id: a.id,
        name: a.name,
        priceLabel: formatCurrency(a.price),
      }))}
      selectedAddonIds={selectedAddons.map((a) => a.id)}
      onToggleAddon={(id) => {
        const addon = addonDetails.find((a) => a.id === id);
        if (!addon) return;
        setSelectedAddons((current) =>
          current.some((item) => item.id === id)
            ? current.filter((item) => item.id !== id)
            : [...current, addon]
        );
      }}
      addonsLoading={addonsLoading}
      addonsError={addonsError}
      totalLabel={formatCurrency(total)}
      submitDisabled={numericQuantity === 0}
      onSubmit={handleAddToOrder}
      labels={{
        specialInstructions: t('product_dialog.special_instructions'),
        specialInstructionsPlaceholder: t('product_dialog.special_instructions_placeholder'),
        quantity: t('product_dialog.quantity'),
        variants: t('product_dialog.variants'),
        addons: t('product_dialog.addons'),
        loadingAddons: t('product_dialog.loading_addons'),
        noAddons: t('product_dialog.no_addons'),
        total: t('product_dialog.total'),
        submit:
          editMode || existingCartItem
            ? t('product_dialog.update_order')
            : t('product_dialog.add_to_order'),
      }}
    />
  );
};

export default ProductDialog;
