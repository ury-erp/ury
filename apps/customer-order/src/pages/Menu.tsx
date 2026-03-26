import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ShoppingCart, Search, ArrowLeft, Utensils, Plus, Minus } from 'lucide-react'
import { Button, Card, Badge, Input, Loader } from '@ury/ui'
import { useCartStore } from '@ury/cart'
import { getPublicMenu } from '@ury/menu'
import type { MenuItem } from '@ury/menu'

interface Category {
  name: string
  items: MenuItem[]
}

export default function Menu() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [activeCategory, setActiveCategory] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [restaurant, setRestaurant] = useState<{ name: string; restaurant_name: string } | null>(null)
  
  const cartStore = useCartStore()
  const cartItemCount = cartStore.getTotalItems()

  useEffect(() => {
    // Get restaurant from session storage
    const stored = sessionStorage.getItem('currentRestaurant')
    if (stored) {
      setRestaurant(JSON.parse(stored))
    }
    
    if (slug) {
      fetchMenu(slug)
    }
  }, [slug])

  const fetchMenu = async (restaurantSlug: string) => {
    try {
      setLoading(true)
      const items = await getPublicMenu(restaurantSlug)
      setMenuItems(items)
      
      // Group by category/course
      const grouped = groupByCategory(items)
      setCategories(grouped)
      
      if (grouped.length > 0) {
        setActiveCategory(grouped[0].name)
      }
    } catch (err) {
      setError('Failed to load menu')
    } finally {
      setLoading(false)
    }
  }

  const groupByCategory = (items: MenuItem[]): Category[] => {
    const grouped: Record<string, MenuItem[]> = {}
    
    items.forEach(item => {
      const category = item.course || item.item_group || 'Other'
      if (!grouped[category]) {
        grouped[category] = []
      }
      grouped[category].push(item)
    })
    
    return Object.entries(grouped).map(([name, items]) => ({
      name,
      items
    }))
  }

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return []
    
    return menuItems.filter(item => 
      item.item_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()))
    )
  }, [searchQuery, menuItems])

  const handleAddToCart = (item: MenuItem) => {
    if (!restaurant) return
    
    cartStore.addItem({
      item_code: item.item_code,
      item_name: item.item_name,
      rate: item.rate,
      qty: 1,
      comment: ''
    })
  }

  const handleUpdateQty = (itemCode: string, delta: number) => {
    const currentQty = cartStore.getItemQuantity(itemCode)
    const newQty = currentQty + delta
    
    if (newQty <= 0) {
      cartStore.removeItem(itemCode)
    } else {
      cartStore.updateQuantity(itemCode, newQty)
    }
  }

  const getItemQtyInCart = (itemCode: string) => {
    return cartStore.getItemQuantity(itemCode)
  }

  const scrollToCategory = (categoryName: string) => {
    setActiveCategory(categoryName)
    const element = document.getElementById(`category-${categoryName}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <p className="text-red-600 mb-4">{error}</p>
        <Button onClick={() => slug && fetchMenu(slug)}>Retry</Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b shadow-sm">
        <div className="max-w-md mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            
            <div className="flex-1">
              <h1 className="font-semibold text-gray-900 truncate">
                {restaurant?.restaurant_name || 'Menu'}
              </h1>
            </div>
            
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              onClick={() => navigate('/cart')}
            >
              <ShoppingCart className="w-5 h-5" />
              {cartItemCount > 0 && (
                <Badge 
                  variant="destructive" 
                  className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
                >
                  {cartItemCount}
                </Badge>
              )}
            </Button>
          </div>
          
          {/* Search Bar */}
          <div className="mt-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search menu..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Category Tabs - Horizontal Scroll */}
      {!searchQuery && categories.length > 0 && (
        <div className="sticky top-[105px] z-30 bg-gray-50 border-b">
          <div className="max-w-md mx-auto">
            <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-hide">
              {categories.map(category => (
                <button
                  key={category.name}
                  onClick={() => scrollToCategory(category.name)}
                  className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    activeCategory === category.name
                      ? 'bg-primary-600 text-white'
                      : 'bg-white text-gray-700 border hover:bg-gray-50'
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Menu Content */}
      <div className="max-w-md mx-auto px-4 py-4">
        {searchQuery ? (
          // Search Results
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-gray-500">
              {filteredItems.length} results for "{searchQuery}"
            </h2>
            {filteredItems.map(item => (
              <MenuItemCard
                key={item.item_code}
                item={item}
                qty={getItemQtyInCart(item.item_code)}
                onAdd={() => handleAddToCart(item)}
                onUpdateQty={(delta) => handleUpdateQty(item.item_code, delta)}
              />
            ))}
            {filteredItems.length === 0 && (
              <div className="text-center py-12">
                <Utensils className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No items found</p>
              </div>
            )}
          </div>
        ) : (
          // Categories
          <div className="space-y-6">
            {categories.map(category => (
              <div key={category.name} id={`category-${category.name}`}>
                <h2 className="text-lg font-semibold text-gray-900 mb-3">
                  {category.name}
                </h2>
                <div className="space-y-3">
                  {category.items.map(item => (
                    <MenuItemCard
                      key={item.item_code}
                      item={item}
                      qty={getItemQtyInCart(item.item_code)}
                      onAdd={() => handleAddToCart(item)}
                      onUpdateQty={(delta) => handleUpdateQty(item.item_code, delta)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating Cart Button */}
      {cartItemCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t">
          <div className="max-w-md mx-auto">
            <Button 
              size="lg" 
              className="w-full"
              onClick={() => navigate('/cart')}
            >
              <ShoppingCart className="w-5 h-5 mr-2" />
              View Cart ({cartItemCount} items)
              <span className="ml-auto font-semibold">
                ${cartStore.getTotal().toFixed(2)}
              </span>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// Menu Item Card Component
interface MenuItemCardProps {
  item: MenuItem
  qty: number
  onAdd: () => void
  onUpdateQty: (delta: number) => void
}

function MenuItemCard({ item, qty, onAdd, onUpdateQty }: MenuItemCardProps) {
  return (
    <Card className="p-3 flex gap-3">
      {/* Item Image */}
      <div className="w-20 h-20 shrink-0 bg-gray-100 rounded-lg overflow-hidden">
        {item.item_image ? (
          <img 
            src={item.item_image} 
            alt={item.item_name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Utensils className="w-6 h-6 text-gray-300" />
          </div>
        )}
      </div>
      
      {/* Item Details */}
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-gray-900 truncate">{item.item_name}</h3>
        {item.description && (
          <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{item.description}</p>
        )}
        <div className="flex items-center justify-between mt-2">
          <span className="font-semibold text-gray-900">${item.rate.toFixed(2)}</span>
          
          {qty > 0 ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => onUpdateQty(-1)}
              >
                <Minus className="w-4 h-4" />
              </Button>
              <span className="w-6 text-center font-medium">{qty}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => onUpdateQty(1)}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={onAdd}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
