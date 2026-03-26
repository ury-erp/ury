import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useOrderStatus, useRealtimeOrderStatus, OrderStatus as OrderStatusType } from '@ury/order'
import { Button, Card, Badge, Spinner, showToast } from '@ury/ui'
import { 
  ArrowLeft, 
  RefreshCw, 
  Bell, 
  Clock, 
  MapPin, 
  Receipt,
  ChefHat,
  CheckCircle,
  Utensils,
  Package,
  AlertCircle
} from 'lucide-react'

// Fulfillment status stepper configuration
const FULFILLMENT_STEPS = [
  { status: 'Placed', label: 'Placed', icon: Receipt, description: 'Order received' },
  { status: 'Confirmed', label: 'Confirmed', icon: CheckCircle, description: 'Order confirmed' },
  { status: 'Preparing', label: 'Preparing', icon: ChefHat, description: 'In the kitchen' },
  { status: 'Ready', label: 'Ready', icon: Package, description: 'Ready to serve' },
  { status: 'Served', label: 'Served', icon: Utensils, description: 'Enjoy your meal' },
] as const

// Status colors mapping
const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Placed: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' },
  Confirmed: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  Preparing: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' },
  Ready: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
  Served: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
  'Picked Up': { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
  'Out for Delivery': { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  Delivered: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
  Cancelled: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' },
}

// Format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

// Format date
const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Progress Stepper Component
interface ProgressStepperProps {
  currentStatus: string
}

function ProgressStepper({ currentStatus }: ProgressStepperProps) {
  const currentIndex = FULFILLMENT_STEPS.findIndex(step => step.status === currentStatus)
  const isCancelled = currentStatus === 'Cancelled'
  
  if (isCancelled) {
    return (
      <div className="flex items-center justify-center p-6 bg-red-50 rounded-xl border border-red-200">
        <AlertCircle className="w-8 h-8 text-red-500 mr-3" />
        <div>
          <p className="font-semibold text-red-800">Order Cancelled</p>
          <p className="text-sm text-red-600">This order has been cancelled</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Progress Bar Background */}
      <div className="absolute top-5 left-0 right-0 h-1 bg-gray-200 rounded-full" />
      
      {/* Progress Bar Fill */}
      <div 
        className="absolute top-5 left-0 h-1 bg-primary-600 rounded-full transition-all duration-500"
        style={{ 
          width: currentIndex >= 0 
            ? `${(currentIndex / (FULFILLMENT_STEPS.length - 1)) * 100}%` 
            : '0%' 
        }}
      />
      
      {/* Steps */}
      <div className="relative flex justify-between">
        {FULFILLMENT_STEPS.map((step, index) => {
          const Icon = step.icon
          const isCompleted = index <= currentIndex
          const isCurrent = index === currentIndex
          
          return (
            <div key={step.status} className="flex flex-col items-center">
              {/* Step Circle */}
              <div 
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center
                  border-2 transition-all duration-300 z-10
                  ${isCompleted 
                    ? 'bg-primary-600 border-primary-600 text-white' 
                    : 'bg-white border-gray-300 text-gray-400'
                  }
                  ${isCurrent ? 'ring-4 ring-primary-100 scale-110' : ''}
                `}
              >
                <Icon className="w-5 h-5" />
              </div>
              
              {/* Step Label */}
              <div className="mt-2 text-center">
                <p className={`
                  text-xs font-medium transition-colors duration-300
                  ${isCompleted ? 'text-gray-900' : 'text-gray-400'}
                `}>
                  {step.label}
                </p>
                {isCurrent && (
                  <p className="text-xs text-primary-600 mt-0.5 animate-pulse">
                    {step.description}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Order Items Component
interface OrderItemsProps {
  items?: Array<{
    item_code: string
    item_name: string
    qty: number
    rate: number
    amount?: number
  }>
}

function OrderItems({ items = [] }: OrderItemsProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>Order items not available</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div 
          key={`${item.item_code}-${index}`}
          className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
        >
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 bg-primary-50 text-primary-700 rounded-full flex items-center justify-center text-xs font-medium">
                {item.qty}x
              </span>
              <span className="font-medium text-gray-900">{item.item_name}</span>
            </div>
          </div>
          <span className="font-medium text-gray-700">
            {formatCurrency(item.amount || item.rate * item.qty)}
          </span>
        </div>
      ))}
    </div>
  )
}

// Pull to refresh hook
function usePullToRefresh(onRefresh: () => Promise<void>) {
  const [isPulling, setIsPulling] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const startY = useRef(0)
  const isRefreshing = useRef(false)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (window.scrollY === 0 && !isRefreshing.current) {
      startY.current = e.touches[0].clientY
    }
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (startY.current > 0 && window.scrollY === 0 && !isRefreshing.current) {
      const currentY = e.touches[0].clientY
      const diff = currentY - startY.current
      
      if (diff > 0) {
        e.preventDefault()
        const dampedDiff = Math.min(diff * 0.5, 80)
        setPullDistance(dampedDiff)
        setIsPulling(dampedDiff > 40)
      }
    }
  }, [])

  const handleTouchEnd = useCallback(async () => {
    if (isPulling && !isRefreshing.current) {
      isRefreshing.current = true
      setPullDistance(60)
      try {
        await onRefresh()
      } finally {
        isRefreshing.current = false
        setPullDistance(0)
        setIsPulling(false)
        startY.current = 0
      }
    } else {
      setPullDistance(0)
      setIsPulling(false)
      startY.current = 0
    }
  }, [isPulling, onRefresh])

  return {
    pullDistance,
    isPulling,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    }
  }
}

// Main Order Status Component
export default function OrderStatus() {
  const { orderToken } = useParams<{ orderToken: string }>()
  const navigate = useNavigate()
  const [isCallingWaiter, setIsCallingWaiter] = useState(false)
  
  // Get order status with polling
  const { 
    status, 
    loading, 
    error, 
    refresh 
  } = useOrderStatus(orderToken || null)
  
  // Get real-time updates
  const realtimeStatus = useRealtimeOrderStatus(orderToken || null)
  
  // Merge realtime updates with polled status
  const orderStatus: OrderStatusType | null = realtimeStatus || status
  
  // Pull to refresh
  const { pullDistance, isPulling, handlers } = usePullToRefresh(async () => {
    await refresh()
    showToast.success('Status updated')
  })
  
  // Handle call waiter
  const handleCallWaiter = useCallback(async () => {
    if (!orderToken || !orderStatus?.table) return
    
    setIsCallingWaiter(true)
    try {
      const frappe = (window as any).frappe
      if (frappe?.realtime) {
        frappe.realtime.emit('call_waiter', {
          order_token: orderToken,
          table: orderStatus.table,
          restaurant: orderStatus.restaurant,
          timestamp: new Date().toISOString(),
        })
        showToast.success('Waiter has been notified')
      } else {
        showToast.error('Unable to connect to restaurant system')
      }
    } catch (err) {
      showToast.error('Failed to call waiter. Please try again.')
    } finally {
      setIsCallingWaiter(false)
    }
  }, [orderToken, orderStatus])
  
  // Handle manual refresh
  const handleRefresh = useCallback(async () => {
    await refresh()
    showToast.success('Status refreshed')
  }, [refresh])
  
  // Get status color config
  const statusConfig = orderStatus?.fulfillment_status 
    ? STATUS_COLORS[orderStatus.fulfillment_status] || STATUS_COLORS.Placed
    : STATUS_COLORS.Placed

  // Loading state
  if (loading && !orderStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Spinner message="Loading order status..." />
      </div>
    )
  }
  
  // Error state
  if (error && !orderStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-sm">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Order Not Found</h2>
          <p className="text-gray-500 mb-6">{error}</p>
          <Button onClick={() => navigate('/')}>
            Back to Home
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div 
      className="min-h-screen bg-gray-50"
      {...handlers}
    >
      {/* Pull to refresh indicator */}
      <div 
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center transition-transform duration-200"
        style={{ 
          transform: `translateY(${pullDistance - 60}px)`,
          opacity: pullDistance > 20 ? 1 : 0
        }}
      >
        <div className="bg-white rounded-full p-3 shadow-lg">
          <RefreshCw className={`w-6 h-6 text-primary-600 ${isPulling ? 'animate-spin' : ''}`} />
        </div>
      </div>

      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => navigate('/')}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Order Status</h1>
                <p className="text-xs text-gray-500">
                  Token: {orderToken?.slice(0, 8).toUpperCase()}...
                </p>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={handleRefresh}
              disabled={loading}
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-4 max-w-lg mx-auto">
        {/* Order Info Card */}
        <Card className="overflow-hidden">
          <div className={`p-4 ${statusConfig.bg} border-b ${statusConfig.border}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Current Status</p>
                <Badge 
                  variant={orderStatus?.fulfillment_status === 'Cancelled' ? 'danger' : 'default'}
                  size="lg"
                  className={statusConfig.text}
                >
                  {orderStatus?.fulfillment_status || 'Loading...'}
                </Badge>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(orderStatus?.grand_total || 0)}
                </p>
                <p className="text-sm text-gray-500">Total Amount</p>
              </div>
            </div>
          </div>
          
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <MapPin className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600">Restaurant:</span>
              <span className="font-medium text-gray-900">
                {orderStatus?.restaurant || 'Loading...'}
              </span>
            </div>
            
            {orderStatus?.table && (
              <div className="flex items-center gap-3 text-sm">
                <Utensils className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600">Table:</span>
                <span className="font-medium text-gray-900">{orderStatus.table}</span>
              </div>
            )}
            
            {orderStatus?.customer_name && (
              <div className="flex items-center gap-3 text-sm">
                <Receipt className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600">Customer:</span>
                <span className="font-medium text-gray-900">{orderStatus.customer_name}</span>
              </div>
            )}
            
            {orderStatus?.created_at && (
              <div className="flex items-center gap-3 text-sm">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600">Ordered:</span>
                <span className="font-medium text-gray-900">
                  {formatDate(orderStatus.created_at)}
                </span>
              </div>
            )}
          </div>
        </Card>

        {/* Progress Stepper */}
        <Card className="p-6">
          <h2 className="font-semibold text-gray-900 mb-6">Order Progress</h2>
          <ProgressStepper currentStatus={orderStatus?.fulfillment_status || 'Placed'} />
        </Card>

        {/* Order Items */}
        <Card className="p-4">
          <h2 className="font-semibold text-gray-900 mb-4">Order Items</h2>
          <OrderItems items={(orderStatus as any)?.items || []} />
          
          {/* Total */}
          <div className="border-t border-gray-200 mt-4 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Grand Total</span>
              <span className="text-xl font-bold text-primary-600">
                {formatCurrency(orderStatus?.grand_total || 0)}
              </span>
            </div>
          </div>
        </Card>

        {/* Actions */}
        <div className="space-y-3 pt-4 pb-8">
          <Button
            size="lg"
            className="w-full"
            variant="outline"
            onClick={handleCallWaiter}
            disabled={isCallingWaiter}
          >
            {isCallingWaiter ? (
              <>
                <Spinner hideMessage className="w-4 h-4 mr-2" />
                Calling...
              </>
            ) : (
              <>
                <Bell className="w-5 h-5 mr-2" />
                Call Waiter
              </>
            )}
          </Button>
          
          <p className="text-center text-xs text-gray-500">
            Need help? Call a waiter for assistance
          </p>
        </div>
      </main>

      {/* Real-time indicator */}
      {realtimeStatus && (
        <div className="fixed bottom-4 right-4 bg-green-500 text-white px-3 py-1.5 rounded-full text-xs font-medium shadow-lg animate-in fade-in slide-in-from-bottom-2">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
            Live updates
          </span>
        </div>
      )}
    </div>
  )
}
