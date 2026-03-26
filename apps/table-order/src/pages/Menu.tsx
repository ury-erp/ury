import { useState, useMemo } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { usePublicMenu } from '@ury/menu'
import { useCart } from '@ury/cart'
import { Button, Badge, Card, showToast, Spinner } from '@ury/ui'
import { ShoppingCart, Plus, Minus, ChefHat } from 'lucide-react'

interface MenuItemProps {
  item: {
    item: string
    item_name: string
    rate: number
    item_image?: string | null
    course?: string
    description?: string
  }
  quantity: number
  onAdd: () => void
  onRemove: () => void
}

function MenuItemCard({ item, quantity, onAdd, onRemove }: MenuItemProps) {
  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <div className="flex">
        <div className="w-24 h-24 bg-gray-200 flex-shrink-0">
          {item.item_image ? (
            <img 
              src={item.item_image} 
              alt={item.item_name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <ChefHat className="w-8 h-8" />
            </div>
          )}
        </div>
        <div className="flex-1 p-3 flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 line-clamp-1">{item.item_name}</h3>
            <p className="text-sm text-gray-500 line-clamp-2 mt-1">{item.description || item.course}</p>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="font-bold text-lg">${item.rate.toFixed(2)}</span>
            <div className="flex items-center gap-2">
              {quantity > 0 && (
                <>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-8 w-8 rounded-full"
                    onClick={onRemove}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span className="w-6 text-center font-medium">{quantity}</span>
                </>
              )}
              <Button 
                variant="default" 
                size="icon" 
                className="h-8 w-8 rounded-full bg-primary-600"
                onClick={onAdd}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

export default function Menu() {
  const { restaurant } = useParams<{ restaurant: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const table = searchParams.get('table')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  
  const { menu, loading, error } = usePublicMenu(restaurant || '', 'Dine In')
  const { items, addItem, removeItem, getTotals } = useCart()
  
  const totals = getTotals()
  
  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set(menu.map(item => item.course || 'Other').filter(Boolean))
    return ['all', ...Array.from(cats)]
  }, [menu])
  
  // Filter items by category
  const filteredItems = useMemo(() => {
    if (selectedCategory === 'all') return menu
    return menu.filter(item => item.course === selectedCategory)
  }, [menu, selectedCategory])
  
  // Get item quantity from cart
  const getItemQuantity = (itemCode: string) => {
    const cartItem = items.find(i => i.id === itemCode && !i.selectedVariant && !i.selectedAddons?.length)
    return cartItem?.quantity || 0
  }
  
  const handleAddItem = (item: any) => {
    addItem({
      id: item.item,
      name: item.item_name,
      price: item.rate,
      quantity: 1,
      image: item.item_image,
    })
    showToast.success(`Added ${item.item_name} to cart`)
  }
  
  const handleRemoveItem = (item: any) => {
    const cartItem = items.find(i => i.id === item.item && !i.selectedVariant && !i.selectedAddons?.length)
    if (cartItem) {
      if (cartItem.quantity > 1) {
        // Update quantity - need to handle this differently in cart
        showToast.info('Use cart to modify quantity')
      } else {
        removeItem(cartItem.uniqueId)
        showToast.info(`Removed ${item.item_name}`)
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner message="Loading menu..." />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-500">{error}</p>
          <Button onClick={() => window.location.reload()} className="mt-4">
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Menu</h1>
              {table && (
                <p className="text-sm text-gray-500">Table: {table}</p>
              )}
            </div>
            <Button
              variant="outline"
              className="relative"
              onClick={() => navigate('/cart')}
            >
              <ShoppingCart className="w-5 h-5" />
              {totals.itemCount > 0 && (
                <Badge 
                  variant="default" 
                  className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs"
                >
                  {totals.itemCount}
                </Badge>
              )}
            </Button>
          </div>
        </div>
        
        {/* Category Filter */}
        <div className="px-4 pb-3 overflow-x-auto">
          <div className="flex gap-2">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {cat === 'all' ? 'All Items' : cat}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Menu Items */}
      <main className="p-4">
        <div className="space-y-4">
          {filteredItems.map(item => (
            <MenuItemCard
              key={item.item}
              item={item}
              quantity={getItemQuantity(item.item)}
              onAdd={() => handleAddItem(item)}
              onRemove={() => handleRemoveItem(item)}
            />
          ))}
        </div>
      </main>

      {/* Bottom Cart Bar */}
      {totals.itemCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4">
          <div className="flex items-center justify-between max-w-lg mx-auto">
            <div>
              <p className="text-sm text-gray-500">{totals.itemCount} items</p>
              <p className="text-xl font-bold">${totals.total.toFixed(2)}</p>
            </div>
            <Button 
              size="lg" 
              className="bg-primary-600"
              onClick={() => navigate('/cart')}
            >
              View Cart
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
