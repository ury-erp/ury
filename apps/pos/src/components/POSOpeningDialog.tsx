import { RefreshCw, AlertTriangle, Monitor } from 'lucide-react';
import { Button } from './ui';

interface POSOpeningDialogProps {
  onReload: () => void;
  type: 'opening' | 'closing';
}

const POSOpeningDialog = ({ onReload, type }: POSOpeningDialogProps) => {
  const isOpeningIssue = type === 'opening';
  
  const handleSwitchToDesk = () => {
    // Get the current domain and open /app in a new tab
    const currentDomain = window.location.origin;
    window.open(`${currentDomain}/app`, '_blank');
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 shadow-xl">
        <div className="text-center">
          {/* Icon */}
          <div className={`mx-auto flex items-center justify-center h-16 w-16 rounded-full mb-6 ${
            isOpeningIssue ? 'bg-red-100' : 'bg-orange-100'
          }`}>
            {isOpeningIssue ? (
              <RefreshCw className="h-8 w-8 text-red-600" />
            ) : (
              <AlertTriangle className="h-8 w-8 text-orange-600" />
            )}
          </div>
          
          {/* Title */}
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {isOpeningIssue ? 'POS Not Opened' : 'Previous POS Not Closed'}
          </h2>
          
          {/* Message */}
          <p className="text-gray-600 mb-8 text-lg">
            {isOpeningIssue 
              ? 'Please open POS Entry to continue using the system.'
              : 'Please close the previous POS Entry to continue.'
            }
          </p>
          
          {/* Buttons */}
          <div className="space-y-3">
            <Button
              onClick={onReload}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors duration-200"
            >
              <RefreshCw className="w-5 h-5 mr-2" />
              Reload Page
            </Button>
            
            <Button
              onClick={handleSwitchToDesk}
              variant="outline"
              className="w-full border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-3 px-6 rounded-lg transition-colors duration-200"
            >
              <Monitor className="w-5 h-5 mr-2" />
              Switch to Desk
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default POSOpeningDialog; 