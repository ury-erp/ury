import React from 'react';
import { Spinner } from './ui/spinner';

const InitialLoader: React.FC = () => {
  return (
    <div className="fixed inset-0 bg-white flex items-center justify-center">
      <div className="text-center">
        <Spinner className="w-12 h-12" />
        <p className="mt-4 text-lg font-medium text-gray-900">Loading URY POS...</p>
        <p className="mt-2 text-sm text-gray-500">Please wait while we set things up</p>
      </div>
    </div>
  );
};

export default InitialLoader; 