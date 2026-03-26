/**
 * Inactivity Warning Component
 * Shows a warning before the kiosk resets due to inactivity
 */

import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Touch } from 'lucide-react';

interface InactivityWarningProps {
  isVisible: boolean;
  onContinue: () => void;
}

export function InactivityWarning({ isVisible, onContinue }: InactivityWarningProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-8"
          onClick={onContinue}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white rounded-3xl shadow-2xl p-8 md:p-12 max-w-lg w-full text-center"
            onClick={e => e.stopPropagation()}
          >
            {/* Icon */}
            <div className="w-24 h-24 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-12 h-12 text-amber-600" />
            </div>

            {/* Title */}
            <h2 className="text-3xl font-bold text-foreground mb-4">
              Are you still there?
            </h2>

            {/* Message */}
            <p className="text-xl text-gray-600 mb-8">
              Your session will reset in a few seconds due to inactivity.
              Touch anywhere to continue ordering.
            </p>

            {/* Action button */}
            <button
              onClick={onContinue}
              className="kiosk-btn-primary w-full text-xl py-6 flex items-center justify-center gap-3"
            >
              <Touch className="w-6 h-6" />
              Continue Ordering
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default InactivityWarning;
