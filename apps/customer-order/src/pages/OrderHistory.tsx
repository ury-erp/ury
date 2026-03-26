import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, Clock, Utensils, ChevronRight, Phone, History } from 'lucide-react'
import { Button, Card, Input, Badge, Loader } from '@ury/ui'
import { frappeApp } from '@ury/api-client'

interface OrderHistoryItem {
  order_token: string
  invoice_id: string
  restaurant: string
  restaurant_name: string
  fulfillment_status: string
  grand_total: number
  created_at: string
  item_count: number
}

export default function OrderHistory() {
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [savedPhone, setSavedPhone] = useState('')
  const [orders, setOrders] = useState<OrderHistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Load saved phone from localStorage
    const customerInfo = localStorage.getItem('customerInfo')
    if (customerInfo) {
      const { phone: saved } = JSON.parse(customerInfo)
      if (saved) {
        setPhone(saved)
        setSavedPhone(saved)
        fetchOrders(saved)
      }
    }
  }, [])

  const fetchOrders = async (phoneNumber: string) => {
    try {
      setLoading(true)
      setError('')
      
      const frappe = frappeApp.getClient()
      const result = await frappe.call({
        method: 'ury.ury_customer.api.get_order_history',
        args: { phone: phoneNumber }
      })
      
      if (result.message) {
        setOrders(result.message)
      }
    } catch (err) {
      setError('Failed to load order history')
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => {
    if (phone.length < 10) {
      setError('Please enter a valid phone number')
      return
    }
    setSavedPhone(phone)
    fetchOrders(phone)
  }

  const getStatusColor = (status: string): any => {
    const colors: Record<string, string> = {
      'Placed': 'secondary',
      'Confirmed': 'secondary',
      'Preparing': 'warning',
      'Ready': 'success',
      'Served': 'success',
      'Picked Up': 'success',
      'Out for Delivery': 'info',
      'Delivered': 'success',
      'Cancelled': 'destructive'
    }
    return colors[status] || 'secondary'
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
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
            <h1 className="font-semibold text-gray-900">Order History</h1>
          </div>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-4">
        {/* Phone Input */}
        <Card className="p-4 mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Enter your phone number to view past orders
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                className="pl-10"
                placeholder="+1 (555) 123-4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                type="tel"
              />
            </div>
            <Button onClick={handleSearch} disabled={loading}>
              {loading ? <Loader size="sm" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>
          {error && (
            <p className="text-sm text-red-600 mt-2">{error}</p>
          )}
        </Card>

        {/* Orders List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader size="lg" />
          </div>
        ) : orders.length > 0 ? (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-gray-500 px-1">
              {orders.length} order{orders.length !== 1 ? 's' : ''} found
            </h2>
            {orders.map(order => (
              <Card 
                key={order.order_token}
                className="p-4 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/track/${order.order_token}`)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">
                        {order.restaurant_name}
                      </span>
                      <Badge variant={getStatusColor(order.fulfillment_status)} className="text-xs">
                        {order.fulfillment_status}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">
                      Order #{order.order_token}
                    </p>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-gray-600">
                        {order.item_count} item{order.item_count !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1 text-gray-500">
                        <Clock className="w-3 h-3" />
                        {formatDate(order.created_at)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">
                      ${order.grand_total.toFixed(2)}
                    </p>
                    <ChevronRight className="w-5 h-5 text-gray-400 ml-auto" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : savedPhone ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <History className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">No Orders Found</h2>
            <p className="text-gray-500 text-sm">
              We couldn't find any orders for {savedPhone}
            </p>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Utensils className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">View Your Orders</h2>
            <p className="text-gray-500 text-sm">
              Enter your phone number above to see your order history
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
