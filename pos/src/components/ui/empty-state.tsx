import { t } from '../../i18n';

/**
 * Empty state component displayed when there's no data to show.
 * Provides a consistent look across the app for empty lists, tables, charts, etc.
 *
 * Usage:
 *   <EmptyState
 *     icon={ShoppingCart}
 *     title="No orders yet"
 *     description="Orders will appear here once customers start placing them."
 *     action={<Button onClick={onCreate}>Create Order</Button>}
 *   />
 */
interface EmptyStateProps {
  /** Lucide icon component */
  icon?: React.ComponentType<{ className?: string }>;
  /** Main heading */
  title?: string;
  /** Supporting text */
  description?: string;
  /** Optional action button or element */
  action?: React.ReactNode;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = 'md',
}: EmptyStateProps) {
  const sizeStyles = {
    sm: {
      container: 'py-6',
      icon: 'w-8 h-8',
      title: 'text-sm',
      description: 'text-xs',
    },
    md: {
      container: 'py-12',
      icon: 'w-12 h-12',
      title: 'text-lg',
      description: 'text-sm',
    },
    lg: {
      container: 'py-20',
      icon: 'w-16 h-16',
      title: 'text-xl',
      description: 'text-base',
    },
  };

  const styles = sizeStyles[size];

  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${styles.container}`}
      role="status"
      aria-label={title || t('common.no_data') || 'No data'}
    >
      {Icon && (
        <div className="mb-4 rounded-full bg-gray-100 p-3">
          <Icon className={`${styles.icon} text-gray-400`} />
        </div>
      )}
      {title && <h3 className={`${styles.title} font-medium text-gray-900 mb-1`}>{title}</h3>}
      {description && (
        <p className={`${styles.description} text-gray-500 max-w-sm`}>{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
