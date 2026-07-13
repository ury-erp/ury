import React from 'react';
import { Spinner } from './ui/spinner';
import { t } from '../i18n';

const InitialLoader: React.FC = () => {
  return (
    <div className="fixed inset-0 bg-white flex items-center justify-center">
      <div className="text-center">
        <Spinner className="w-12 h-12" />
        <p className="mt-4 text-lg font-medium text-gray-900">{t('common.loading_ury_pos')}</p>
        <p className="mt-2 text-sm text-gray-500">{t('common.please_wait_setup')}</p>
      </div>
    </div>
  );
};

export default InitialLoader; 