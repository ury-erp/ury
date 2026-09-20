import { useState, useEffect } from 'react';
import ScreenSizeDialog from './ScreenSizeDialog';
import { POS_MIN_WIDTH } from '../hooks/useViewport';

interface ScreenSizeProviderProps {
  children: React.ReactNode;
}

/**
 * The floor under the cashier surface, now a phone floor rather than a
 * desktop one.
 *
 * It used to be 1024px, which refused every tablet in the device matrix —
 * including the 768×1024 and 820×1180 portrait tablets the POS is meant to
 * run on — and sent the user off to the legacy app instead. The floor could
 * not simply be lowered: at 768px the three fixed columns (categories rail,
 * menu, 384px order panel) left no menu to read. The tablet layouts landed
 * first (POS.tsx, Orders.tsx, `hooks/useViewport.ts`), and the floor follows
 * them down to `POS_MIN_WIDTH` (UX-06).
 *
 * Phones are still out of scope for the cashier surface and keep the legacy
 * fallback. This provider renders above the router (App.tsx:
 * ScreenSizeProvider > AuthGuard > POSOpeningProvider > Router), so a blind
 * width check would also take out the captain surface (`/ury/order*`), which
 * is deliberately mobile-first — hence the exemption below.
 */
const isCaptainRoute = () => window.location.pathname.includes('/order');

const ScreenSizeProvider = ({ children }: ScreenSizeProviderProps) => {
  const [isScreenTooSmall, setIsScreenTooSmall] = useState(false);

  useEffect(() => {
    const checkScreenSize = () => {
      setIsScreenTooSmall(window.innerWidth < POS_MIN_WIDTH && !isCaptainRoute());
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    // A tablet turned on its side changes width without always firing a
    // resize first, and the 768px boundary is exactly where that matters.
    window.addEventListener('orientationchange', checkScreenSize);

    return () => {
      window.removeEventListener('resize', checkScreenSize);
      window.removeEventListener('orientationchange', checkScreenSize);
    };
  }, []);

  if (isScreenTooSmall) {
    return <ScreenSizeDialog />;
  }

  return <>{children}</>;
};

export default ScreenSizeProvider;
