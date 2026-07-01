import { useState, useEffect, useRef } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { t } from '../i18n';

/**
 * Network status indicator component.
 *
 * Displays a subtle banner when the app goes offline and
 * a brief "Back online" toast when connectivity is restored.
 * Uses the browser's `navigator.onLine` API and listens
 * for `online`/`offline` events.
 */
export function NetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wasOffline, setWasOffline] = useState(!navigator.onLine);
  const wasOfflineRef = useRef(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Show "back online" briefly if we were previously offline
      if (wasOfflineRef.current) {
        setWasOffline(true);
        const timer = setTimeout(() => {
          setWasOffline(false);
          wasOfflineRef.current = false;
        }, 3000);
        return () => clearTimeout(timer);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
      wasOfflineRef.current = true;
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Don't render anything when online and never was offline
  if (isOnline && !wasOffline) return null;

  // Back online briefly
  if (isOnline && wasOffline) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
        <div className="bg-green-600 text-white px-4 py-1.5 rounded-b-lg shadow-lg flex items-center gap-2 text-sm font-medium animate-slide-down">
          <Wifi className="w-4 h-4" />
          {t('network.back_online')}
        </div>
      </div>
    );
  }

  // Offline banner
  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
      <div className="bg-red-600 text-white px-4 py-1.5 rounded-b-lg shadow-lg flex items-center gap-2 text-sm font-medium animate-slide-down">
        <WifiOff className="w-4 h-4" />
        {t('network.offline')}
      </div>
    </div>
  );
}
