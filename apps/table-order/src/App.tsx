import { Routes, Route } from 'react-router-dom'
import { ToastProvider } from '@ury/ui'
import TokenResolver from './pages/TokenResolver'
import Menu from './pages/Menu'
import Cart from './pages/Cart'
import OrderStatus from './pages/OrderStatus'

function App() {
  return (
    <>
      <ToastProvider />
      <div className="min-h-screen bg-gray-50">
        <Routes>
          <Route path="/t/:token" element={<TokenResolver />} />
          <Route path="/menu/:restaurant" element={<Menu />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/status/:orderToken" element={<OrderStatus />} />
          <Route path="/" element={<div className="p-4 text-center">Scan QR code to order</div>} />
        </Routes>
      </div>
    </>
  )
}

export default App
