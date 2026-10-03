import React from 'react';
import { useLocation } from 'react-router-dom';
import { Ban } from 'lucide-react';
import { isRouteHidden } from '@ury/core';
import { Spinner } from '@ury/ui';
import { useAccess } from '../hooks/useAccess';
import { t } from '../i18n';

/**
 * A route that belongs to an optional feature. While the feature is switched
 * off the page is not rendered — its server calls would be refused anyway —
 * and a plain explanation is shown instead of a screen full of errors.
 */
export const FeatureRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const { access, loaded } = useAccess();

  if (!loaded) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8 text-primary" />
      </div>
    );
  }
  if (isRouteHidden(access, pathname)) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <Ban className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">{t('access.feature_off_title')}</h1>
        <p className="mt-2 text-sm text-gray-500">{t('access.feature_off_body')}</p>
      </div>
    );
  }
  return <>{children}</>;
};

export default FeatureRoute;
