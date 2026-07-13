import React from 'react';
import { t } from '../../i18n';

const Loader: React.FC<{ message?: string }> = ({ message }) => {
  const displayMessage = message ?? t('common.loading');
  return (
    <div className="flex flex-col items-center justify-center h-full w-full py-12">
      <svg className="animate-spin h-8 w-8 text-blue-600 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      <span className="text-gray-600 text-sm" role="status" aria-live="polite">{displayMessage}</span>
    </div>
  );
};

export default Loader; 