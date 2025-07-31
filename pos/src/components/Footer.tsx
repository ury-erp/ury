import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutGrid, 
  ClipboardList, 
} from 'lucide-react';
import { cn } from '../lib/utils';
import { usePOSStore } from '../store/pos-store';
import PaymentDialog from './PaymentDialog';

const Footer = () => {
  const { activeOrders } = usePOSStore();
  const [showPayment, setShowPayment] = useState(false);

  const total = activeOrders.reduce((sum, item) => {
    const basePrice = item.selectedVariant?.price || item.price;
    const addonsTotal = item.selectedAddons?.reduce((sum, addon) => sum + addon.price, 0) || 0;
    return sum + (basePrice + addonsTotal) * item.quantity;
  }, 0);

  const navItems = [
    { icon: LayoutGrid, label: 'POS', path: '/' },
    { icon: ClipboardList, label: 'Orders', path: '/orders' },
  ];

  return (
    <div className="bg-white border-t border-gray-200 py-2 relative">
      <nav className="max-w-screen-xl mx-auto px-4">
        <div className="flex justify-center items-center gap-4">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center p-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors',
                  isActive && 'text-blue-600'
                )
              }
            >
              <item.icon className="w-5 h-5" />
              <span className="text-xs mt-1">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
      
      {showPayment && (
        <PaymentDialog
          onClose={() => setShowPayment(false)}
          totalAmount={total}
        />
      )}
    </div>
  );
};

export default Footer; 