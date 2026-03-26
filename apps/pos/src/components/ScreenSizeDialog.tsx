import { Monitor, Smartphone, ExternalLink } from 'lucide-react';
import { Button } from './ui';

const ScreenSizeDialog = () => {
  const handleSwitchToVersion1 = () => {
    // Get the current domain and open /urypos in a new tab
    const currentDomain = window.location.origin;
    window.open(`${currentDomain}/urypos`, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 shadow-xl">
        <div className="text-center">
          {/* Icon */}
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 mb-6">
            <div className="relative">
              <Monitor className="h-8 w-8 text-blue-600" />
              <Smartphone className="h-4 w-4 text-red-500 absolute -top-1 -right-1" />
            </div>
          </div>
          
          {/* Title */}
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Desktop Only
          </h2>
          
          {/* Message */}
          <div className="text-gray-600 mb-8 space-y-3">
            <p className="text-lg">
              This POS system is designed for desktop computers and tablets with larger screens.
            </p>
            <p className="text-sm">
              Mobile support will be available in a future update. Please use a device with a screen width of 1024px or larger.
            </p>
          </div>
          
          {/* Current Screen Info */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-600">
              Current screen width: <span className="font-semibold text-gray-800">{window.innerWidth}px</span>
            </p>
            <p className="text-sm text-gray-600">
              Required: <span className="font-semibold text-gray-800">1024px or larger</span>
            </p>
          </div>
          
          {/* Alternative Option */}
          <div className="bg-blue-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800 mb-3">
              You can use URY POS Version 1 for mobile devices.
            </p>
            <Button
              onClick={handleSwitchToVersion1}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200 text-sm"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Switch to Version 1
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScreenSizeDialog; 