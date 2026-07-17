import React from 'react';
import { t } from '../i18n';
import { logger } from '../lib/logger';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** Called when the error boundary catches an error */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** Called when the user clicks "Try Again" */
  onRetry?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorCount: number;
}

/**
 * Enhanced ErrorBoundary with retry UI, error reporting, and recovery options.
 *
 * Features:
 * - Displays a user-friendly error screen with error details
 * - "Try Again" button that resets the boundary (allowing the component tree to re-render)
 * - "Reload Page" button as a last resort
 * - Tracks error count to detect persistent failures
 * - Calls optional onError/onRetry callbacks for external error reporting
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorCount: 0 };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, errorCount: 0 };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const errorCount = this.state.errorCount + 1;
    this.setState({ errorCount });

    logger.error('ErrorBoundary caught:', error, errorInfo.componentStack);

    // Call external error handler if provided
    this.props.onError?.(error, errorInfo);

    // If errors keep recurring after retry, log a warning
    if (errorCount >= 3) {
      logger.warn(
        `ErrorBoundary: ${errorCount} consecutive errors detected. Consider reloading the page.`,
      );
    }
  }

  handleRetry = () => {
    logger.info('ErrorBoundary: User initiated retry');
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  handleReload = () => {
    logger.info('ErrorBoundary: User initiated page reload');
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isPersistentError = this.state.errorCount >= 3;

      return (
        <div
          className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6"
          role="alert"
          aria-live="assertive"
        >
          <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-red-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              {t('error_boundary.title')}
            </h1>
            <p className="text-gray-600 mb-2">{t('error_boundary.message')}</p>
            {this.state.error && (
              <p className="text-sm text-red-500 bg-red-50 rounded p-3 mb-4 font-mono break-all">
                {this.state.error.message}
              </p>
            )}
            {isPersistentError && (
              <p className="text-sm text-amber-600 bg-amber-50 rounded p-2 mb-4">
                {t('error_boundary.persistent_error')}
              </p>
            )}
            <div className="flex gap-3 justify-center mt-4">
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                {t('error_boundary.try_again')}
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
              >
                {t('error_boundary.reload_page')}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
