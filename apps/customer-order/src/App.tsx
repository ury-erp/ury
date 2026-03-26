import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@ury/ui'

// Pages
import RestaurantLanding from './pages/RestaurantLanding'
import Menu from './pages/Menu'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import OrderTracking from './pages/OrderTracking'
import OrderHistory from './pages/OrderHistory'

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        {/* Restaurant Landing Page - Entry point */}
        <Route path="/:slug" element={<RestaurantLanding />} />
        
        {/* Menu Page */}
        <Route path="/:slug/menu" element={<Menu />} />
        
        {/* Cart Page */}
        <Route path="/cart" element={<Cart />} />
        
        {/* Checkout Page */}
        <Route path="/checkout" element={<Checkout />} />
        
        {/* Order Tracking */}
        <Route path="/track/:token" element={<OrderTracking />} />
        
        {/* Order History by phone */}
        <Route path="/orders" element={<OrderHistory />} />
        
        {/* Redirect root to a default path or show restaurant list */}
        <Route path="/" element={<Navigate to="/demo-restaurant" replace />} />
      </Routes>
      <Toaster />
    </div>
  )
}

export default App
