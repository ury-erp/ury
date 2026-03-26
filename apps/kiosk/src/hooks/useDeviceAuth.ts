/**
 * Hook for managing kiosk device authentication
 * Stores and validates device tokens in localStorage
 */

import { useState, useEffect, useCallback } from 'react';
import { KioskConfig, DeviceAuth } from '@/types';

const STORAGE_KEY = 'ury_kiosk_device_auth';
const CONFIG_KEY = 'ury_kiosk_config';

interface UseDeviceAuthReturn {
  config: KioskConfig | null;
  isLoading: boolean;
  isConfigured: boolean;
  error: string | null;
  configureDevice: (token: string, restaurant: string) => Promise<boolean>;
  clearDevice: () => void;
}

export function useDeviceAuth(): UseDeviceAuthReturn {
  const [config, setConfig] = useState<KioskConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load existing configuration on mount
  useEffect(() => {
    const loadConfig = () => {
      try {
        const storedAuth = localStorage.getItem(STORAGE_KEY);
        const storedConfig = localStorage.getItem(CONFIG_KEY);

        if (storedAuth && storedConfig) {
          const auth: DeviceAuth = JSON.parse(storedAuth);
          const parsedConfig: KioskConfig = JSON.parse(storedConfig);
          
          // Check if token is still valid (optional: add expiry check)
          if (auth.token && auth.restaurant) {
            setConfig(parsedConfig);
          }
        }
      } catch (err) {
        console.error('Failed to load kiosk config:', err);
        setError('Failed to load configuration');
      } finally {
        setIsLoading(false);
      }
    };

    loadConfig();
  }, []);

  // Configure new device
  const configureDevice = useCallback(async (
    token: string, 
    restaurant: string
  ): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      // In production, this would validate the token with the backend
      // For now, we'll accept any non-empty token
      if (!token || !restaurant) {
        setError('Invalid device token or restaurant');
        return false;
      }

      const auth: DeviceAuth = {
        token,
        restaurant,
        validatedAt: new Date().toISOString(),
      };

      const kioskConfig: KioskConfig = {
        deviceToken: token,
        restaurant,
        restaurantName: restaurant, // Will be updated from API
      };

      // Store in localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
      localStorage.setItem(CONFIG_KEY, JSON.stringify(kioskConfig));

      setConfig(kioskConfig);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Configuration failed');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Clear device configuration
  const clearDevice = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(CONFIG_KEY);
    setConfig(null);
    setError(null);
  }, []);

  return {
    config,
    isLoading,
    isConfigured: !!config,
    error,
    configureDevice,
    clearDevice,
  };
}

export default useDeviceAuth;
