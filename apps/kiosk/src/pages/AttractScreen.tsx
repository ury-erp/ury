/**
 * Attract Screen - Full-screen welcome with "Touch to Order"
 * This is the idle state that draws customers in
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Utensils, Touch } from 'lucide-react';

interface AttractScreenProps {
  restaurantName: string;
  logo?: string;
  onStart: () => void;
}

export function AttractScreen({ restaurantName, logo, onStart }: AttractScreenProps) {
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    // Show the "Touch to Order" hint after a brief delay
    const timer = setTimeout(() => setShowHint(true), 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 flex flex-col items-center justify-center cursor-pointer overflow-hidden"
      onClick={onStart}
    >
      {/* Animated background circles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-1/4 left-1/4 w-96 h-96 bg-white/5 rounded-full"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-white/5 rounded-full"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      {/* Main content */}
      <motion.div
        className="relative z-10 text-center px-8"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.6 }}
      >
        {/* Logo or Icon */}
        <motion.div
          className="mb-12"
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          {logo ? (
            <img
              src={logo}
              alt={restaurantName}
              className="w-40 h-40 object-contain mx-auto drop-shadow-2xl"
            />
          ) : (
            <div className="w-40 h-40 bg-white/20 rounded-3xl flex items-center justify-center mx-auto backdrop-blur-sm">
              <Utensils className="w-20 h-20 text-white" />
            </div>
          )}
        </motion.div>

        {/* Restaurant name */}
        <h1 className="text-6xl md:text-8xl font-extrabold text-white mb-4 drop-shadow-lg">
          {restaurantName}
        </h1>

        <p className="text-2xl md:text-3xl text-white/80 font-medium">
          Self-Service Ordering
        </p>
      </motion.div>

      {/* Touch to order prompt */}
      {showHint && (
        <motion.div
          className="absolute bottom-32 left-1/2 -translate-x-1/2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <motion.div
            className="flex flex-col items-center gap-4"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-2xl animate-pulse-glow">
              <Touch className="w-12 h-12 text-primary" />
            </div>
            <span className="text-2xl font-bold text-white drop-shadow-md">
              Touch to Order
            </span>
          </motion.div>
        </motion.div>
      )}

      {/* Bottom decorative elements */}
      <div className="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
    </motion.div>
  );
}

export default AttractScreen;
