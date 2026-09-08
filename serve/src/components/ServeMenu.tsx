import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { ProductConfigurator, cn, Spinner } from '@ury/ui'
import { formatCurrency, db } from '@ury/core'
import { useServeStore, type MenuItem, type OrderItem } from '../store/serve-store'
import ServeMenuCard from './ServeMenuCard'

export interface ServeMenuProps {
  canAddItems: boolean
  /** When false, confirmed (invoice) lines cannot be reduced from the menu. */
  canReduce?: boolean
  /** When false, confirmed lines cannot be removed (qty cannot go below 1). */
  canRemove?: boolean
}

function isPositiveQty(value: string): boolean {
  const n = Number(value)
  return Number.isFinite(n) && n > 0
}

function sumItemQty(orders: OrderItem[], itemCode: string): number {
  return orders.reduce((sum, row) => (row.item === itemCode ? sum + row.quantity : sum), 0)
}

function linesForItem(orders: OrderItem[], itemCode: string): OrderItem[] {
  return orders.filter((row) => row.item === itemCode && row.uniqueId)
}

/** Prefer reducing the newest draft line; fall back to confirmed when allowed. */
function canDecrementItem(
  orders: OrderItem[],
  itemCode: string,
  canReduce: boolean,
  canRemove: boolean
): boolean {
  const lines = linesForItem(orders, itemCode)
  if (lines.length === 0) return false
  const draft = lines.filter((row) => !row.invoiceItemName)
  if (draft.length > 0) return true
  if (!canReduce) return false
  const confirmedQty = lines.reduce((sum, row) => sum + row.quantity, 0)
  return confirmedQty > 1 || canRemove
}

export default function ServeMenu({
  canAddItems,
  canReduce = false,
  canRemove = false,
}: ServeMenuProps) {
  const {
    menuItems,
    menuLoading,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    categories,
    fetchMenuItems,
    addToOrder,
    removeFromOrder,
    updateQuantity,
    activeOrders,
    setSelectedItem,
    selectedItem,
    isOrderInteractionDisabled,
    quickFilter,
    setQuickFilter,
    posProfile,
  } = useServeStore()

  const [editing, setEditing] = useState(false)
  const [itemDoc, setItemDoc] = useState<Record<string, unknown> | null>(null)
  const [itemFetchLoading, setItemFetchLoading] = useState(false)
  const [quantity, setQuantity] = useState('1')
  const [comments, setComments] = useState('')
  const [selectedAddons, setSelectedAddons] = useState<Array<{ id: string; name: string; price: number }>>([])
  const fetchTokenRef = useRef(0)

  useEffect(() => {
    void fetchMenuItems()
  }, [fetchMenuItems])

  useEffect(() => {
    if (!selectedItem || !editing) return
    const token = ++fetchTokenRef.current
    setItemFetchLoading(true)
    db.getDoc('Item', selectedItem.item)
      .then((doc) => {
        if (fetchTokenRef.current !== token) return
        setItemDoc(doc as Record<string, unknown>)
      })
      .catch(() => {
        if (fetchTokenRef.current !== token) return
        setItemDoc(null)
      })
      .finally(() => {
        if (fetchTokenRef.current === token) setItemFetchLoading(false)
      })
  }, [selectedItem, editing])

  const filteredItems = useMemo(() => {
    const term = searchQuery.toLowerCase()
    return menuItems.filter((item) => {
      if (item.disabled) return false
      const matchesCategory = !selectedCategory || item.course === selectedCategory
      const matchesSearch =
        !searchQuery ||
        item.name.toLowerCase().includes(term) ||
        item.item.toLowerCase().includes(term)
      const matchesQuick =
        quickFilter === 'all' || (quickFilter === 'special' && item.special_dish === 1)
      return matchesCategory && matchesSearch && matchesQuick
    })
  }, [menuItems, selectedCategory, searchQuery, quickFilter])

  const addonDetails = useMemo(() => {
    const rows = Array.isArray(itemDoc?.custom_pos_add_on_items)
      ? (itemDoc.custom_pos_add_on_items as Array<{ item: string }>)
      : []
    return rows
      .map((entry) => {
        const menuAddon = menuItems.find((m) => m.item === entry.item && !m.disabled)
        if (!menuAddon) return null
        return { id: menuAddon.item, name: menuAddon.item_name, price: Number(menuAddon.price) }
      })
      .filter((row): row is { id: string; name: string; price: number } => Boolean(row))
  }, [itemDoc, menuItems])

  const variantDetails = useMemo(() => {
    const rows = Array.isArray(itemDoc?.custom_pos_item_variants)
      ? (itemDoc.custom_pos_item_variants as Array<{ item: string }>)
      : []
    return rows
      .map((entry) => {
        const menuVariant = menuItems.find((m) => m.item === entry.item && !m.disabled)
        if (!menuVariant) return null
        return { id: menuVariant.item, name: menuVariant.item_name, price: Number(menuVariant.price) }
      })
      .filter((row): row is { id: string; name: string; price: number } => Boolean(row))
  }, [itemDoc, menuItems])

  const disabled = !canAddItems || isOrderInteractionDisabled()
  const showImage = Boolean(posProfile?.show_image)

  const openConfigurator = (item: MenuItem) => {
    if (disabled) return
    setSelectedItem(item)
    setQuantity('1')
    setComments('')
    setSelectedAddons([])
    setItemDoc(null)
    setEditing(true)
  }

  const handleQuickAdd = (item: MenuItem) => {
    if (disabled || item.disabled) return
    void addToOrder({ ...item, quantity: 1 })
  }

  const handleDecrement = useCallback(
    (item: MenuItem) => {
      if (disabled || item.disabled) return
      if (!canDecrementItem(activeOrders, item.item, canReduce, canRemove)) return

      const lines = linesForItem(activeOrders, item.item)
      const draft = lines.filter((row) => !row.invoiceItemName)
      const target = draft.length > 0 ? draft[draft.length - 1] : lines[lines.length - 1]
      if (!target?.uniqueId) return

      const nextQty = target.quantity - 1
      if (nextQty <= 0) {
        const isConfirmed = Boolean(target.invoiceItemName)
        if (isConfirmed && !canRemove) return
        void removeFromOrder(target.uniqueId)
        return
      }
      void updateQuantity(target.uniqueId, nextQty)
    },
    [activeOrders, canReduce, canRemove, disabled, removeFromOrder, updateQuantity]
  )

  const handleSubmit = useCallback(() => {
    if (!selectedItem || !isPositiveQty(quantity) || itemFetchLoading) return
    const qty = Number(quantity)
    void addToOrder({
      ...selectedItem,
      quantity: qty,
      comment: comments || undefined,
    } as OrderItem)
    selectedAddons.forEach((addon) => {
      const menuAddon = menuItems.find((m) => m.item === addon.id)
      if (menuAddon) void addToOrder({ ...menuAddon, quantity: qty, price: addon.price })
    })
    setEditing(false)
    setSelectedItem(null)
  }, [selectedItem, quantity, comments, selectedAddons, addToOrder, menuItems, setSelectedItem, itemFetchLoading])

  if (menuLoading && menuItems.length === 0) {
    return <Spinner message="Loading menu…" />
  }

  const basePrice = Number(selectedItem?.price) || 0
  const numericQuantity = isPositiveQty(quantity) ? Number(quantity) : 0
  const total = (basePrice + selectedAddons.reduce((s, a) => s + a.price, 0)) * numericQuantity
  const submitDisabled = !isPositiveQty(quantity) || itemFetchLoading || disabled

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 space-y-2 border-b border-border bg-white p-3">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search menu"
            className="w-full rounded-lg border border-border bg-gray-50 py-3 pe-3 ps-9 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setQuickFilter(quickFilter === 'special' ? 'all' : 'special')}
            className={cn(
              'min-h-11 shrink-0 rounded-full border px-3 py-2 text-sm font-medium',
              quickFilter === 'special'
                ? 'border-amber-600 bg-amber-50 text-amber-800'
                : 'border-border bg-white text-gray-700'
            )}
          >
            Specials
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('')}
            className={cn(
              'min-h-11 shrink-0 rounded-full border px-4 py-2 text-sm font-medium',
              selectedCategory === ''
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-border bg-white text-gray-700'
            )}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.name}
              type="button"
              onClick={() => setSelectedCategory(cat.name)}
              className={cn(
                'min-h-11 shrink-0 rounded-full border px-4 py-2 text-sm font-medium',
                selectedCategory === cat.name
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-border bg-white text-gray-700'
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto p-3 sm:grid-cols-3">
        {filteredItems.map((item) => {
          const qty = sumItemQty(activeOrders, item.item)
          return (
            <ServeMenuCard
              key={item.id}
              name={item.name}
              price={item.price}
              imageUrl={showImage ? item.image : null}
              course={item.course_label || item.course}
              item={item.item}
              disabled={disabled}
              branch={posProfile?.branch}
              company={posProfile?.company}
              quantity={qty}
              onClick={() => handleQuickAdd(item)}
              onConfigure={() => openConfigurator(item)}
              onIncrement={() => handleQuickAdd(item)}
              onDecrement={() => handleDecrement(item)}
              incrementDisabled={disabled}
              decrementDisabled={
                disabled || !canDecrementItem(activeOrders, item.item, canReduce, canRemove)
              }
            />
          )
        })}
      </div>

      {editing && selectedItem && (
        <ProductConfigurator
          open={editing}
          onOpenChange={(next) => {
            if (!next) {
              setEditing(false)
              setSelectedItem(null)
            }
          }}
          itemName={selectedItem.item_name}
          itemCode={selectedItem.item}
          courseLabel={selectedItem.course_label || selectedItem.course}
          imageUrl={
            showImage
              ? ((itemDoc?.image as string | undefined) || selectedItem.image)
              : null
          }
          quantity={quantity}
          onQuantityChange={(v) => /^\d*\.?\d*$/.test(v) && setQuantity(v)}
          onQuantityBlur={() => {
            if (quantity === '' || !isPositiveQty(quantity)) setQuantity('0')
          }}
          onIncrement={() => setQuantity(String(Math.min(99, (Number(quantity) || 0) + 1)))}
          onDecrement={() => setQuantity(String(Math.max(0, (Number(quantity) || 0) - 1)))}
          comments={comments}
          onCommentsChange={setComments}
          variants={variantDetails.map((v) => ({
            id: v.id,
            name: v.name,
            priceLabel: formatCurrency(v.price),
          }))}
          selectedVariantId={(itemDoc?.item as string | undefined) || selectedItem.item}
          onSelectVariant={(id) => {
            const menuVariant = menuItems.find((m) => m.item === id)
            if (menuVariant) {
              setSelectedItem(menuVariant)
              setSelectedAddons([])
            }
          }}
          addons={addonDetails.map((a) => ({
            id: a.id,
            name: a.name,
            priceLabel: formatCurrency(a.price),
          }))}
          selectedAddonIds={selectedAddons.map((a) => a.id)}
          onToggleAddon={(id) => {
            const addon = addonDetails.find((a) => a.id === id)
            if (!addon) return
            setSelectedAddons((cur) =>
              cur.some((a) => a.id === id) ? cur.filter((a) => a.id !== id) : [...cur, addon]
            )
          }}
          addonsLoading={itemFetchLoading}
          totalLabel={formatCurrency(total)}
          submitDisabled={submitDisabled}
          onSubmit={handleSubmit}
          labels={{
            specialInstructions: 'Special instructions',
            specialInstructionsPlaceholder: 'Notes for kitchen…',
            quantity: 'Quantity',
            variants: 'Variants',
            addons: 'Add-ons',
            loadingAddons: 'Loading add-ons…',
            noAddons: 'No add-ons',
            total: 'Total',
            submit: 'Add to order',
          }}
        />
      )}
    </div>
  )
}
