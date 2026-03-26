import { useState, useEffect } from 'react';
import { Shield, Lock, Info } from 'lucide-react';
import { Badge } from '../../components/ui';
import { getURYRoles, type URYRole } from '../../lib/permissions-api';
import { showToast } from '../../components/ui/toast';

// Group capabilities by category
const CATEGORY_LABELS: Record<string, string> = {
  users: 'User Management',
  roles: 'Role Management',
  orders: 'Orders',
  payments: 'Payments',
  kitchen: 'Kitchen',
  dispatch: 'Dispatch',
  reports: 'Reports',
  settings: 'Settings',
  branches: 'Branches',
  shifts: 'Shifts',
  menu: 'Menu',
};

function groupCapabilitiesByCategory(capabilities: { capability: string; label: string }[]) {
  const groups: Record<string, { capability: string; label: string }[]> = {};
  
  capabilities.forEach((cap) => {
    const category = cap.capability.split('.')[0];
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(cap);
  });
  
  return groups;
}

const RolesPage = () => {
  const [roles, setRoles] = useState<URYRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);

  const fetchRoles = async () => {
    try {
      setIsLoading(true);
      const rolesData = await getURYRoles();
      setRoles(rolesData);
    } catch (err) {
      showToast.error((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading roles...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center space-x-2">
          <Shield className="w-6 h-6 text-gray-700" />
          <span>Roles & Permissions</span>
        </h2>
        <p className="text-gray-600 mt-1">
          View URY roles and their capabilities. Roles are managed by administrators.
        </p>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-start space-x-3">
        <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-800">
          <p className="font-medium">Read-only view</p>
          <p>
            To create custom roles or modify capabilities, please use the{' '}
            <a href="/app/ury-role" className="underline hover:text-blue-900">
              Frappe Desk
            </a>
            . System roles cannot be modified.
          </p>
        </div>
      </div>

      {/* Roles Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {roles.map((role) => {
          const isExpanded = expandedRole === role.role_name;
          const capabilityGroups = groupCapabilitiesByCategory(role.capabilities);
          
          return (
            <div
              key={role.role_name}
              className="bg-white rounded-lg border border-gray-200 overflow-hidden"
            >
              {/* Role Header */}
              <div
                className="p-4 border-b border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpandedRole(isExpanded ? null : role.role_name)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900 flex items-center space-x-2">
                      <span>{role.role_name}</span>
                      {role.is_system_role === 1 && (
                        <span className="inline-flex items-center space-x-1 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                          <Lock className="w-3 h-3" />
                          <span>System</span>
                        </span>
                      )}
                    </h3>
                    {role.description && (
                      <p className="text-sm text-gray-600 mt-1">{role.description}</p>
                    )}
                  </div>
                  <Badge variant="secondary">
                    {role.capabilities.length} capabilities
                  </Badge>
                </div>
              </div>

              {/* Capabilities List */}
              {isExpanded && (
                <div className="p-4 bg-gray-50">
                  {Object.entries(capabilityGroups).map(([category, caps]) => (
                    <div key={category} className="mb-4 last:mb-0">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        {CATEGORY_LABELS[category] || category}
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {caps.map((cap) => (
                          <Badge
                            key={cap.capability}
                            variant="outline"
                            className="text-xs font-mono bg-white"
                            title={cap.label}
                          >
                            {cap.capability}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                  {role.capabilities.length === 0 && (
                    <p className="text-sm text-gray-500 italic">No capabilities assigned.</p>
                  )}
                </div>
              )}

              {/* Expand/Collapse Hint */}
              {!isExpanded && (
                <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
                  <span className="text-xs text-gray-500">Click to view capabilities</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {roles.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No roles found.
        </div>
      )}
    </div>
  );
};

export default RolesPage;
