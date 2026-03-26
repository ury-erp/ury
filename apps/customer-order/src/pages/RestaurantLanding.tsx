import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Clock, MapPin, Phone, ChevronRight, Utensils, Star, Info } from 'lucide-react'
import { Button, Card, Badge, Loader } from '@ury/ui'
import { frappeApp } from '@ury/api-client'

interface RestaurantInfo {
  name: string
  restaurant_name: string
  branch?: string
  slug: string
  logo?: string
  address?: string
  phone?: string
  description?: string
  accepts_online_orders: boolean
  opening_hours?: {
    day: string
    open: string
    close: string
    is_closed: boolean
  }[]
  rating?: number
  delivery_time?: string
  minimum_order?: number
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default function RestaurantLanding() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [restaurant, setRestaurant] = useState<RestaurantInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isOpen, setIsOpen] = useState<boolean | null>(null)

  useEffect(() => {
    if (slug) {
      fetchRestaurantInfo(slug)
    }
  }, [slug])

  const fetchRestaurantInfo = async (restaurantSlug: string) => {
    try {
      setLoading(true)
      const frappe = frappeApp.getClient()
      const result = await frappe.call({
        method: 'ury.ury_customer.api.get_restaurant_info',
        args: { slug: restaurantSlug }
      })
      
      if (result.message) {
        setRestaurant(result.message)
        checkIfOpen(result.message.opening_hours)
      } else {
        setError('Restaurant not found')
      }
    } catch (err) {
      setError('Failed to load restaurant information')
    } finally {
      setLoading(false)
    }
  }

  const checkIfOpen = (openingHours?: RestaurantInfo['opening_hours']) => {
    if (!openingHours || openingHours.length === 0) {
      setIsOpen(null)
      return
    }

    const now = new Date()
    const currentDay = DAYS_OF_WEEK[now.getDay() - 1] || 'Sunday'
    const currentTime = now.getHours() * 60 + now.getMinutes()

    const todayHours = openingHours.find(h => h.day === currentDay)
    if (!todayHours || todayHours.is_closed) {
      setIsOpen(false)
      return
    }

    const [openHour, openMin] = todayHours.open.split(':').map(Number)
    const [closeHour, closeMin] = todayHours.close.split(':').map(Number)
    const openTime = openHour * 60 + openMin
    const closeTime = closeHour * 60 + closeMin

    setIsOpen(currentTime >= openTime && currentTime <= closeTime)
  }

  const handleEnterMenu = () => {
    if (restaurant) {
      // Store restaurant info in session for use across pages
      sessionStorage.setItem('currentRestaurant', JSON.stringify(restaurant))
      navigate(`/${slug}/menu`)
    }
  }

  const formatTime = (time: string) => {
    const [hour, minute] = time.split(':')
    const h = parseInt(hour)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 || 12
    return `${h12}:${minute} ${ampm}`
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader size="lg" />
      </div>
    )
  }

  if (error || !restaurant) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <Info className="w-16 h-16 text-gray-400 mb-4" />
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Restaurant Not Found</h1>
        <p className="text-gray-600 text-center mb-6">{error || 'The restaurant you are looking for does not exist.'}</p>
        <Button onClick={() => window.location.reload()}>Try Again</Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Image/Logo Section */}
      <div className="bg-gradient-to-b from-primary-600 to-primary-700 text-white">
        <div className="max-w-md mx-auto px-4 py-8">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            {restaurant.logo ? (
              <img 
                src={restaurant.logo} 
                alt={restaurant.restaurant_name}
                className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center border-4 border-white/30">
                <Utensils className="w-10 h-10 text-white" />
              </div>
            )}
          </div>
          
          {/* Restaurant Name */}
          <h1 className="text-2xl font-bold text-center mb-1">
            {restaurant.restaurant_name}
          </h1>
          {restaurant.branch && (
            <p className="text-center text-white/80 text-sm mb-3">{restaurant.branch}</p>
          )}
          
          {/* Rating & Delivery Time */}
          <div className="flex items-center justify-center gap-4 text-sm">
            {restaurant.rating && (
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                <span>{restaurant.rating}</span>
              </div>
            )}
            {restaurant.delivery_time && (
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>{restaurant.delivery_time}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-md mx-auto px-4 py-6 space-y-4">
        {/* Status Badge */}
        {isOpen !== null && (
          <div className="flex justify-center">
            <Badge 
              variant={isOpen ? 'success' : 'secondary'}
              className="text-sm px-4 py-1"
            >
              {isOpen ? '🟢 Open Now' : '🔴 Currently Closed'}
            </Badge>
          </div>
        )}

        {/* Description */}
        {restaurant.description && (
          <Card className="p-4">
            <p className="text-gray-600 text-sm leading-relaxed">
              {restaurant.description}
            </p>
          </Card>
        )}

        {/* Opening Hours */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-5 h-5 text-primary-600" />
            <h2 className="font-semibold text-gray-900">Opening Hours</h2>
          </div>
          <div className="space-y-2">
            {restaurant.opening_hours && restaurant.opening_hours.length > 0 ? (
              restaurant.opening_hours.map((hours, index) => (
                <div 
                  key={index}
                  className={`flex justify-between text-sm ${
                    hours.day === DAYS_OF_WEEK[new Date().getDay() - 1] 
                      ? 'text-primary-600 font-medium' 
                      : 'text-gray-600'
                  }`}
                >
                  <span>{hours.day.slice(0, 3)}</span>
                  <span>
                    {hours.is_closed 
                      ? 'Closed' 
                      : `${formatTime(hours.open)} - ${formatTime(hours.close)}`
                    }
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">Opening hours not available</p>
            )}
          </div>
        </Card>

        {/* Contact Info */}
        {(restaurant.address || restaurant.phone) && (
          <Card className="p-4">
            <h2 className="font-semibold text-gray-900 mb-3">Contact</h2>
            <div className="space-y-2">
              {restaurant.address && (
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <span className="text-gray-600">{restaurant.address}</span>
                </div>
              )}
              {restaurant.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                  <a href={`tel:${restaurant.phone}`} className="text-primary-600">
                    {restaurant.phone}
                  </a>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Minimum Order */}
        {restaurant.minimum_order && restaurant.minimum_order > 0 && (
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Minimum Order</span>
              <span className="font-semibold text-gray-900">
                ${restaurant.minimum_order.toFixed(2)}
              </span>
            </div>
          </Card>
        )}

        {/* CTA Button */}
        <div className="pt-4">
          <Button 
            size="lg" 
            className="w-full"
            onClick={handleEnterMenu}
            disabled={!restaurant.accepts_online_orders}
          >
            {restaurant.accepts_online_orders ? (
              <>
                Order Now
                <ChevronRight className="w-5 h-5 ml-2" />
              </>
            ) : (
              'Online Ordering Unavailable'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
