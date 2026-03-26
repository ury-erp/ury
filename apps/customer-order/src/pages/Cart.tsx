import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Trash2, Plus, Minus, Clock, ShoppingBag, AlertCircle } from 'lucide-react'
import { Button, Card, Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ury/ui'
import { useCartStore } from '@ury/cart'
import { ORDER_TYPES } from '@ury/config'

const PICKUP_INTERVALS = 15 // minutes
const MAX_ADVANCE_MINUTES = 7 * 24 * 60 // 7 days

export default function Cart() {
  const navigate = useNavigate()
  const cartStore = useCartStore()
  const [selectedTime, setSelectedTime] = useState<string>('asap')
  const [orderType, setOrderType] = useState<string>('Take Away')
  
  const items = cartStore.items
  const total = cartStore.getTotal()
  const itemCount = cartStore.getTotalItems()

  // Generate time slots
  const timeSlots = useMemo(() => {
    const slots: { value: string; label: string }[] = [
      { value: 'asap', label: 'As soon as possible' }
    ]
    
    const now = new Date()
    const startTime = new Date(now.getTime() + 20 * 60 * 1000) // 20 mins from now
    startTime.setMinutes(Math.ceil(startTime.getMinutes() / PICKUP_INTERVALS) * PICKUP_INTERVALS, 0, 0)
    
    const endTime = new Date(now.getTime() + MAX_ADVANCE_MINUTES * 60 * 1000)
    
    let current = new Date(startTime)
    while (current <= endTime) {
      const hours = current.getHours().toString().padStart(2, '0')
      const minutes = current.getMinutes().toString().padStart(2, '0')
      const ampm = current.getHours() >= 12 ? 'PM' : 'AM'
      const hours12 = current.getHours() % 12 || 12
      
      const isToday = current.toDateString() === now.toDateString()
      const dayLabel = isToday ? 'Today' : 
        current.toDateString() === new Date(now.getTime() + 24 * 60 * 60 * 1000).toDateString() 
          ? 'Tomorrow' 
          : current.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      
      slots.push({
        value: current.toISOString(),
        label: `${dayLabel}, ${hours12}:${minutes} ${ampm}`
      })
      
      current = new Date(current.getTime() + PICKUP_INTERVALS * 60 * 1000)
    }
    
    return slots
  }, [])

  // Get available order types
  const availableOrderTypes = useMemo(() => {
    return ORDER_TYPES.filter(ot => 
      ['Take Away', 'Delivery', 'Curbside'].includes(ot.value)
    )
  }, [])

  const handleProceedToCheckout = () => {
    // Store order preferences
    sessionStorage.setItem('orderPreferences', JSON.stringify({
      orderType,
      scheduledTime: selectedTime === 'asap' ? null : selectedTime
    }))
    navigate('/checkout')
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b">
          <div className="max-w-md mx-auto px-4 py-3">
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h1 className="font-semibold text-gray-900">Your Cart</h1>
            </div>
          </div>
        </header>
        
        {/* Empty State */}
        <div className="max-w-md mx-auto px-4 py-16 flex flex-col items-center">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <ShoppingBag className="w-10 h-10 text-gray-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Your cart is empty</h2>
          <p className="text-gray-500 text-center mb-6">Add some delicious items from the menu</p>
          <Button onClick={() => navigate(-1)}>
            Browse Menu
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
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
              <h1 className="font-semibold text-gray-900">Your Cart</h1>
              <p className="text-sm text-gray-500">{itemCount} items</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-4 space-y-4">
        {/* Cart Items */}
        <Card className="divide-y">
          {items.map((item, index) => (
            <div key={`${item.item_code}-${index}`} className="p-4 flex gap-3">
              <div className="flex-1">
                <h3 className="font-medium text-gray-900">{item.item_name}</h3>
                {item.comment && (
                  <p className="text-xs text-gray-500 mt-0.5">{item.comment}</p>
                )}
                <p className="text-sm text-gray-600 mt-1">
                  ${(item.rate * item.qty).toFixed(2)}
                </p>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    if (item.qty <= 1) {
                      cartStore.removeItem(item.item_code)
                    } else {
                      cartStore.updateQuantity(item.item_code, item.qty - 1)
                    }
                  }}
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <span className="w-6 text-center font-medium">{item.qty}</span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => cartStore.updateQuantity(item.item_code, item.qty + 1)}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </Card>

        {/* Order Type Selection */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <ShoppingBag className="w-5 h-5 text-primary-600" />
            <h2 className="font-semibold text-gray-900">Order Type</h2>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {availableOrderTypes.map(type => (
              <button
                key={type.value}
                onClick={() => setOrderType(type.value)}
                className={`p-3 rounded-lg text-sm font-medium transition-colors text-center ${
                  orderType === type.value
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
          {orderType === 'Delivery' && (
            <div className="mt-3 flex items-start gap-2 text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>Delivery charges may apply. You'll enter your address at checkout.</p>
            </div>
          )}
        </Card>

        {/* Pickup Time Selection */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-5 h-5 text-primary-600" />
            <h2 className="font-semibold text-gray-900">When?</h2>
          </div>
          <Select value={selectedTime} onValueChange={setSelectedTime}>
            <SelectTrigger>
              <SelectValue placeholder="Select pickup time" />
            </SelectTrigger>
            <SelectContent>
              {timeSlots.map(slot => (
                <SelectItem key={slot.value} value={slot.value}>
                  {slot.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Card>

        {/* Order Summary */}
        <Card className="p-4">
          <h2 className="font-semibold text-gray-900 mb-3">Order Summary</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>${total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Tax</span>
              <span>Calculated at checkout</span>
            </div>
            {orderType === 'Delivery' && (
              <div className="flex justify-between text-gray-600">
                <span>Delivery Fee</span>
                <span>Calculated at checkout</span>
              </div>
            )}
            <div className="border-t pt-2 mt-2">
              <div className="flex justify-between font-semibold text-gray-900">
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Clear Cart */}
        <button
          onClick={() => cartStore.clearCart()}
          className="flex items-center gap-2 text-red-600 text-sm mx-auto py-2"
        >
          <Trash2 className="w-4 h-4" />
          Clear Cart
        </button>
      </div>

      {/* Bottom Action */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t">
        <div className="max-w-md mx-auto">
          <Button 
            size="lg" 
            className="w-full"
            onClick={handleProceedToCheckout}
          >
            Proceed to Checkout
            <span className="ml-auto font-semibold">${total.toFixed(2)}</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
