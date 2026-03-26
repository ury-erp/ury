import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCart } from '@ury/cart'
import { useCreateOrder } from '@ury/order'
import { Button, Card, Input, Spinner, showToast } from '@ury/ui'
import { ArrowLeft, Plus, Minus, Trash2, User, Phone, MessageSquare } from 'lucide-react'

export default function Cart() {
  const navigate = useNavigate()
  const { items, removeItem, updateQuantity, getTotals, clearCart } = useCart()
  const { createOrder, loading: placingOrder } = useCreateOrder()
  
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [comments, setComments] = useState('')
  
  const totals = getTotals()
  
  // Get table context from session
  const tableContext = JSON.parse(sessionStorage.getItem('tableContext') || '{}')
  const tableToken = sessionStorage.getItem('tableToken') || ''
  
  const handleUpdateQuantity = (uniqueId: string, newQty: number) => {
    if (newQty < 1) {
      removeItem(uniqueId)
    } else {
      updateQuantity(uniqueId, newQty)
    }
  }
  
  const handlePlaceOrder = async () => {
    if (!customerName.trim()) {
      showToast.error('Please enter your name')
      return
    }
    
    if (items.length === 0) {
      showToast.error('Your cart is empty')
      return
    }
    
    try {
      const orderItems = items.map(item => ({
        item_code: item.id,
        item_name: item.name,
        qty: item.quantity,
        comment: item.comment || '',
      }))
      
      const result = await createOrder({
        restaurant: tableContext.restaurant,
        items: orderItems,
        customer_name: customerName,
        customer_phone: customerPhone,
        table: tableContext.table,
        table_token: tableToken,
        order_type: 'Dine In',
        order_source: 'QR',
        comments: comments,
      })
      
      if (result.status === 'success') {
        showToast.success('Order placed successfully!')
        clearCart()
        navigate(`/status/${result.order_token}`)
      }
    } catch (error) {
      showToast.error('Failed to place order. Please try again.')
    }
  }
  
  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl font-bold">Your Cart</h1>
          </div>
        </header>
        
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <Trash2 className="w-10 h-10 text-gray-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Your cart is empty</h2>
          <p className="text-gray-500 mb-6">Add some delicious items from the menu</p>
          <Button onClick={() => navigate(`/menu/${tableContext.restaurant}?table=${tableContext.table}`)}>
            Browse Menu
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-40">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold">Your Cart ({items.length})</h1>
        </div>
      </header>
      
      <div className="p-4 space-y-4">
        {/* Cart Items */}
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.uniqueId} className="p-4">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{item.name}</h3>
                  {item.selectedVariant && (
                    <p className="text-sm text-gray-500">{item.selectedVariant.name}</p>
                  )}
                  <p className="text-primary-600 font-medium mt-1">
                    ${((item.selectedVariant?.price || item.price) * item.quantity).toFixed(2)}
                  </p>
                </div>
                
                {/* Quantity Controls */}
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    onClick={() => handleUpdateQuantity(item.uniqueId, item.quantity - 1)}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span className="w-8 text-center font-medium">{item.quantity}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    onClick={() => handleUpdateQuantity(item.uniqueId, item.quantity + 1)}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
        
        {/* Customer Details */}
        <Card className="p-4">
          <h2 className="font-semibold text-gray-900 mb-4">Your Details</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <User className="w-4 h-4 inline mr-1" />
                Name *
              </label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Enter your name"
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Phone className="w-4 h-4 inline mr-1" />
                Phone (optional)
              </label>
              <Input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Enter your phone number"
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <MessageSquare className="w-4 h-4 inline mr-1" />
                Special Instructions (optional)
              </label>
              <Input
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Any special requests?"
                className="w-full"
              />
            </div>
          </div>
        </Card>
        
        {/* Order Summary */}
        <Card className="p-4">
          <h2 className="font-semibold text-gray-900 mb-4">Order Summary</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal</span>
              <span>${totals.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Tax</span>
              <span>${totals.tax.toFixed(2)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between font-semibold text-lg">
              <span>Total</span>
              <span className="text-primary-600">${totals.total.toFixed(2)}</span>
            </div>
          </div>
        </Card>
      </div>
      
      {/* Bottom Action */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4">
        <div className="max-w-lg mx-auto">
          <Button
            size="lg"
            className="w-full bg-primary-600"
            onClick={handlePlaceOrder}
            disabled={placingOrder}
          >
            {placingOrder ? (
              <>
                <Spinner hideMessage className="w-4 h-4 mr-2" />
                Placing Order...
              </>
            ) : (
              <>Place Order • ${totals.total.toFixed(2)}</>
            )}
          </Button>
          <p className="text-center text-xs text-gray-500 mt-2">
            Pay at the counter after your meal
          </p>
        </div>
      </div>
    </div>
  )
}
