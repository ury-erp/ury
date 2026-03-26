import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { 
  Check, Clock, ChefHat, Package, Truck, Home, 
  XCircle, ArrowLeft, RefreshCw, Share2, Phone, MessageCircle 
} from 'lucide-react'
import { Button, Card, Badge, Loader } from '@ury/ui'
import { getOrderStatus } from '@ury/order'
import { FULFILLMENT_STATUSES } from '@ury/config'
import type { OrderStatus } from '@ury/order'

const STATUS_STEPS = [
  { status: 'Placed', icon: Check, label: 'Order Placed' },
  { status: 'Confirmed', icon: Check, label: 'Confirmed' },
  { status: 'Preparing', icon: ChefHat, label: 'Preparing' },
  { status: 'Ready', icon: Package, label: 'Ready' },
  { status: 'Picked Up', icon: Home, label: 'Picked Up' },
]

const DELIVERY_STEPS = [
  { status: 'Placed', icon: Check, label: 'Order Placed' },
  { status: 'Confirmed', icon: Check, label: 'Confirmed' },
  { status: 'Preparing', icon: ChefHat, label: 'Preparing' },
  { status: 'Ready', icon: Package, label: 'Ready' },
  { status: 'Out for Delivery', icon: Truck, label: 'On the Way' },
  { status: 'Delivered', icon: Home, label: 'Delivered' },
]

export default function OrderTracking() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  
  const [order, setOrder] = useState<OrderStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (token) {
      fetchOrderStatus(token)
    }
  }, [token])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!token) return
    
    const interval = setInterval(() => {
      fetchOrderStatus(token, true)
    }, 30000)
    
    return () => clearInterval(interval)
  }, [token])

  const fetchOrderStatus = async (orderToken: string, silent = false) => {
    try {
      if (!silent) setLoading(true)
      if (silent) setRefreshing(true)
      
      const result = await getOrderStatus(orderToken)
      setOrder(result)
      setError('')
    } catch (err) {
      setError('Failed to load order status')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const getCurrentStep = (): number => {
    if (!order) return 0
    
    const steps = order.order_type === 'Delivery' ? DELIVERY_STEPS : STATUS_STEPS
    const index = steps.findIndex(s => s.status === order.fulfillment_status)
    
    if (index >= 0) return index
    
    // Handle terminal states
    if (order.fulfillment_status === 'Cancelled') return -1
    if (order.fulfillment_status === 'Served') return steps.length - 1
    if (order.fulfillment_status === 'Delivered') return steps.length - 1
    
    return 0
  }

  const getStatusColor = (status: string) => {
    const config = FULFILLMENT_STATUSES.find(s => s.value === status)
    if (!config) return 'gray'
    return config.color
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Order ${token}`,
          text: `Track my order at URY: ${window.location.href}`,
          url: window.location.href
        })
      } catch (err) {
        // User cancelled share
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(window.location.href)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader size="lg" />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b">
          <div className="max-w-md mx-auto px-4 py-3">
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => navigate('/')}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h1 className="font-semibold text-gray-900">Track Order</h1>
            </div>
          </div>
        </header>
        
        <div className="max-w-md mx-auto px-4 py-16 text-center">
          <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Order Not Found</h2>
          <p className="text-gray-500 mb-6">{error || 'We could not find this order.'}</p>
          <Button onClick={() => navigate('/')}>Go Home</Button>
        </div>
      </div>
    )
  }

  const currentStep = getCurrentStep()
  const isCancelled = order.fulfillment_status === 'Cancelled'
  const isComplete = ['Served', 'Delivered', 'Picked Up'].includes(order.fulfillment_status)
  const steps = order.order_type === 'Delivery' ? DELIVERY_STEPS : STATUS_STEPS
  const statusColor = getStatusColor(order.fulfillment_status)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => navigate('/')}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h1 className="font-semibold text-gray-900">Order Status</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => token && fetchOrderStatus(token, true)}
                disabled={refreshing}
              >
                <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={handleShare}
              >
                <Share2 className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Order Info Card */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm text-gray-500">Order #{order.order_token}</p>
              <p className="text-xs text-gray-400">
                {new Date(order.created_at).toLocaleString()}
              </p>
            </div>
            <Badge 
              variant={isCancelled ? 'destructive' : statusColor as any}
              className="text-sm px-3 py-1"
            >
              {order.fulfillment_status}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Total</span>
            <span className="font-semibold text-lg">${order.grand_total.toFixed(2)}</span>
          </div>
        </Card>

        {/* Status Timeline */}
        {!isCancelled && (
          <Card className="p-4">
            <h2 className="font-semibold text-gray-900 mb-6">Order Progress</h2>
            <div className="space-y-0">
              {steps.map((step, index) => {
                const Icon = step.icon
                const isActive = index <= currentStep
                const isCurrent = index === currentStep && !isComplete
                
                return (
                  <div key={step.status} className="flex gap-4">
                    {/* Timeline line */}
                    {index < steps.length - 1 && (
                      <div 
                        className={`absolute left-[34px] w-0.5 h-12 translate-y-8 ${
                          index < currentStep ? 'bg-primary-600' : 'bg-gray-200'
                        }`}
                      />
                    )}
                    
                    {/* Icon */}
                    <div 
                      className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                        isActive 
                          ? 'bg-primary-600 text-white' 
                          : 'bg-gray-100 text-gray-400'
                      } ${isCurrent ? 'ring-4 ring-primary-100 animate-pulse' : ''}`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    
                    {/* Label */}
                    <div className="flex-1 pb-8">
                      <p className={`font-medium ${
                        isActive ? 'text-gray-900' : 'text-gray-400'
                      }`}>
                        {step.label}
                      </p>
                      {isCurrent && (
                        <p className="text-sm text-primary-600 mt-1">
                          In progress...
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {/* Cancelled State */}
        {isCancelled && (
          <Card className="p-6 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Order Cancelled</h2>
            <p className="text-gray-600 mb-4">
              This order has been cancelled. If you have any questions, please contact the restaurant.
            </p>
          </Card>
        )}

        {/* Order Complete */}
        {isComplete && (
          <Card className="p-6 text-center bg-green-50 border-green-200">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Order {order.fulfillment_status === 'Delivered' ? 'Delivered' : 'Completed'}!
            </h2>
            <p className="text-gray-600">
              Thank you for ordering with us. Enjoy your meal!
            </p>
          </Card>
        )}

        {/* Estimated Time */}
        {!isCancelled && !isComplete && (
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center shrink-0">
                <Clock className="w-6 h-6 text-primary-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Estimated {order.order_type === 'Delivery' ? 'Delivery' : 'Ready'} Time</p>
                <p className="text-xl font-semibold text-gray-900">20-35 minutes</p>
              </div>
            </div>
          </Card>
        )}

        {/* Contact Restaurant */}
        <Card className="p-4">
          <h2 className="font-semibold text-gray-900 mb-3">Need Help?</h2>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1">
              <Phone className="w-4 h-4 mr-2" />
              Call
            </Button>
            <Button variant="outline" className="flex-1">
              <MessageCircle className="w-4 h-4 mr-2" />
              Message
            </Button>
          </div>
        </Card>

        {/* Order Again */}
        {isComplete && (
          <Button 
            className="w-full"
            onClick={() => navigate(`/${order.restaurant}`)}
          >
            Order Again
          </Button>
        )}
      </div>
    </div>
  )
}
