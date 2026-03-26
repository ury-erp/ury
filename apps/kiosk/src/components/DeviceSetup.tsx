/**
 * Device Setup Component
 * Initial setup screen for configuring the kiosk device
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, Store, Key, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useDeviceAuth } from '@/hooks';

interface DeviceSetupProps {
  onConfigured: () => void;
}

export function DeviceSetup({ onConfigured }: DeviceSetupProps) {
  const { configureDevice, isLoading, error } = useDeviceAuth();
  const [step, setStep] = useState(1);
  const [token, setToken] = useState('');
  const [restaurant, setRestaurant] = useState('');

  const handleSubmit = async () => {
    if (step === 1) {
      if (token.trim()) {
        setStep(2);
      }
      return;
    }

    if (restaurant.trim()) {
      const success = await configureDevice(token.trim(), restaurant.trim());
      if (success) {
        onConfigured();
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-2xl p-8 md:p-12 max-w-md w-full"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Settings className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Kiosk Setup
          </h1>
          <p className="text-gray-500">
            Configure this device for self-service ordering
          </p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
            step >= 1 ? 'bg-primary text-white' : 'bg-gray-200 text-gray-500'
          }`}>
            {step > 1 ? <CheckCircle2 className="w-6 h-6" /> : '1'}
          </div>
          <div className={`w-16 h-1 rounded-full ${step > 1 ? 'bg-primary' : 'bg-gray-200'}`} />
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
            step >= 2 ? 'bg-primary text-white' : 'bg-gray-200 text-gray-500'
          }`}>
            2
          </div>
        </div>

        {/* Step 1: Device Token */}
        {step === 1 && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div>
              <label className="flex items-center gap-2 text-lg font-semibold text-foreground mb-3">
                <Key className="w-5 h-5 text-primary" />
                Device Token
              </label>
              <input
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Enter device token from admin"
                className="kiosk-input"
                autoFocus
              />
              <p className="text-sm text-gray-500 mt-2">
                Contact your administrator for the device token
              </p>
            </div>

            <button
              onClick={handleSubmit}
              disabled={!token.trim() || isLoading}
              className="w-full kiosk-btn-primary flex items-center justify-center gap-2"
            >
              Continue
              <ArrowRight className="w-5 h-5" />
            </button>
          </motion.div>
        )}

        {/* Step 2: Restaurant */}
        {step === 2 && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div>
              <label className="flex items-center gap-2 text-lg font-semibold text-foreground mb-3">
                <Store className="w-5 h-5 text-primary" />
                Restaurant
              </label>
              <input
                type="text"
                value={restaurant}
                onChange={(e) => setRestaurant(e.target.value)}
                placeholder="Enter restaurant name or code"
                className="kiosk-input"
                autoFocus
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-700 p-4 rounded-xl text-center">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 kiosk-btn-outline"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={!restaurant.trim() || isLoading}
                className="flex-[2] kiosk-btn-primary flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Complete Setup
                    <CheckCircle2 className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}

        {/* Help text */}
        <p className="text-center text-sm text-gray-400 mt-8">
          This setup only needs to be done once
        </p>
      </motion.div>
    </div>
  );
}

export default DeviceSetup;
