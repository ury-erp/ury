import { Navigate } from 'react-router-dom';
import { usePermissions } from '../contexts/PermissionsContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredCapability: string;
}

export function ProtectedRoute({ children, requiredCapability }: ProtectedRouteProps) {
  const { hasCapability, isLoading } = usePermissions();

  if (isLoading) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  if (!hasCapability(requiredCapability)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
