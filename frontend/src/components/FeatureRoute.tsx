import React from 'react';
import { useLocation } from 'react-router-dom';
import { isRouteHidden } from '@ury/core';
import { EmptyState, Spinner } from '@ury/ui';
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
      <EmptyState
        className="mx-auto max-w-md py-16"
        illustration="unavailable"
        title={t('access.feature_off_title')}
        description={t('access.feature_off_body')}
      />
    );
  }
  return <>{children}</>;
};

export default FeatureRoute;
