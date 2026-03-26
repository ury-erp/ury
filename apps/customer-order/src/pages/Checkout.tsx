import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, User, Phone, MapPin, MessageSquare, CreditCard, Shield, Check } from 'lucide-react'
import { Button, Card, Input, Badge, Loader } from '@ury/ui'
import { useCartStore } from '@ury/cart'
import { createCustomerOrder } from '@ury/order'
import { ORDER_SOURCES } from '@ury/config'

interface OrderPreferences {
  orderType: string
  scheduledTime: string | null
}

export default function Checkout() {
  const navigate = useNavigate()
  const cartStore = useCartStore()
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [restaurant, setRestaurant] = useState<{ name: string; restaurant_name: string } | null>(null)
  const [orderPrefs, setOrderPrefs] = useState<OrderPreferences | null>(null)
  
  // Form state
  const [formData, setFormData] = useState({
    customerName: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    zipCode: '',
    specialInstructions: ''
  })
  const [saveInfo, setSaveInfo] = useState(true)
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  useEffect(() => {
    // Load restaurant and preferences
    const storedRestaurant = sessionStorage.getItem('currentRestaurant')
    const storedPrefs = sessionStorage.getItem('orderPreferences')
    const savedCustomer = localStorage.getItem('customerInfo')
    
    if (storedRestaurant) {
      setRestaurant(JSON.parse(storedRestaurant))
    }
    
    if (storedPrefs) {
      setOrderPrefs(JSON.parse(storedPrefs))
    }
    
    if (savedCustomer) {
      const customer = JSON.parse(savedCustomer)
      setFormData(prev => ({
        ...prev,
        customerName: customer.name || '',
        phone: customer.phone || '',
        email: customer.email || ''
      }))
    }

    // Redirect if cart is empty
    if (cartStore.items.length === 0) {
      navigate('/cart')
    }
  }, [cartStore.items.length, navigate])

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const validateForm = (): boolean => {
    if (!formData.customerName.trim()) {
      setError('Please enter your name')
      return false
    }
    if (!formData.phone.trim() || formData.phone.length < 10) {
      setError('Please enter a valid phone number')
      return false
    }
    if (orderPrefs?.orderType === 'Delivery') {
      if (!formData.address.trim()) {
        setError('Please enter your delivery address')
        return false
      }
    }
    if (!agreedToTerms) {
      setError('Please agree to the terms and conditions')
      return false
    }
    return true
  }

  const handlePlaceOrder = async () => {
    if (!validateForm() || !restaurant) return

    try {
      setLoading(true)
      setError('')

      // Save customer info if requested
      if (saveInfo) {
        localStorage.setItem('customerInfo', JSON.stringify({
          name: formData.customerName,
          phone: formData.phone,
          email: formData.email
        }))
      }

      // Create order
      const result = await createCustomerOrder({
        restaurant: restaurant.name,
        items: cartStore.items.map(item => ({
          item_code: item.item_code,
          qty: item.qty,
          comment: item.comment
        })),
        customer_name: formData.customerName,
        customer_phone: formData.phone,
        order_type: orderPrefs?.orderType || 'Take Away',
        order_source: 'Online',
        comments: formData.specialInstructions,
        scheduled_time: orderPrefs?.scheduledTime || undefined
      })

      if (result.status === 'success') {
        // Clear cart
        cartStore.clearCart()
        
        // Navigate to tracking
        navigate(`/track/${result.order_token}`)
      } else {
        setError(result.message || 'Failed to place order')
      }
    } catch (err) {
      setError('An error occurred while placing your order. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const total = cartStore.getTotal()
  const isDelivery = orderPrefs?.orderType === 'Delivery'

  if (cartStore.items.length === 0) {
    return null
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
              onClick={() => navigate('/cart')}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="font-semibold text-gray-900">Checkout</h1>
          </div>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-4 space-y-4">
        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Order Summary */}
        <Card className="p-4">
          <h2 className="font-semibold text-gray-900 mb-3">Order Summary</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Restaurant</span>
              <span className="font-medium">{restaurant?.restaurant_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Order Type</span>
              <Badge variant="secondary">{orderPrefs?.orderType}</Badge>
            </div>
            {orderPrefs?.scheduledTime && (
              <div className="flex justify-between">
                <span className="text-gray-600">Pickup Time</span>
                <span>{new Date(orderPrefs.scheduledTime).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold pt-2 border-t">
              <span>Total Items</span>
              <span>{cartStore.getTotalItems()}</span>
            </div>
          </div>
        </Card>

        {/* Contact Information */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-5 h-5 text-primary-600" />
            <h2 className="font-semibold text-gray-900">Contact Information</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="John Doe"
                value={formData.customerName}
                onChange={(e) => handleInputChange('customerName', e.target.value)}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  className="pl-10"
                  placeholder="+1 (555) 123-4567"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  type="tel"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                We'll send order updates to this number
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email (optional)
              </label>
              <Input
                placeholder="john@example.com"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                type="email"
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={saveInfo}
                onChange={(e) => setSaveInfo(e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              Save my information for next time
            </label>
          </div>
        </Card>

        {/* Delivery Address */}
        {isDelivery && (
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="w-5 h-5 text-primary-600" />
              <h2 className="font-semibold text-gray-900">Delivery Address</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Street Address <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="123 Main Street, Apt 4B"
                  value={formData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City
                  </label>
                  <Input
                    placeholder="New York"
                    value={formData.city}
                    onChange={(e) => handleInputChange('city', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ZIP Code
                  </label>
                  <Input
                    placeholder="10001"
                    value={formData.zipCode}
                    onChange={(e) => handleInputChange('zipCode', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Special Instructions */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-5 h-5 text-primary-600" />
            <h2 className="font-semibold text-gray-900">Special Instructions</h2>
          </div>
          <textarea
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
            placeholder="Any allergies, dietary requirements, or special requests?"
            value={formData.specialInstructions}
            onChange={(e) => handleInputChange('specialInstructions', e.target.value)}
          />
        </Card>

        {/* Terms & Conditions */}
        <Card className="p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-600">
              I agree to the{' '}
              <a href="#" className="text-primary-600 hover:underline">Terms of Service</a>
              {' '}and{' '}
              <a href="#" className="text-primary-600 hover:underline">Privacy Policy</a>
              . I understand that my order may take 20-45 minutes to prepare.
            </span>
          </label>
        </Card>

        {/* Payment Info */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="w-5 h-5 text-primary-600" />
            <h2 className="font-semibold text-gray-900">Payment</h2>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <div className="w-10 h-6 bg-gray-200 rounded flex items-center justify-center">
              <span className="text-xs font-medium">COD</span>
            </div>
            <span>Pay at {isDelivery ? 'delivery' : 'pickup'}</span>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Online payment coming soon. You'll pay when you {isDelivery ? 'receive your order' : 'pick up'}.
          </p>
        </Card>

        {/* Security Note */}
        <div className="flex items-center gap-2 text-sm text-gray-500 justify-center">
          <Shield className="w-4 h-4" />
          <span>Your information is secure and encrypted</span>
        </div>
      </div>

      {/* Bottom Action */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t">
        <div className="max-w-md mx-auto">
          <Button 
            size="lg" 
            className="w-full"
            onClick={handlePlaceOrder}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader size="sm" className="mr-2" />
                Placing Order...
              </>
            ) : (
              <>
                Place Order
                <span className="ml-auto font-semibold">${total.toFixed(2)}</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
