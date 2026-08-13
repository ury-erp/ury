import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useBranchContext } from '../../context/BranchContext';
import { logout } from '@ury/core';
import {
  Search,
  Bell,
  User,
  ChevronDown,
  X,
  CheckCircle2,
  AlertTriangle,
  Info,
  LogOut,
  Settings,
  Store,
  Building2,
  Check
} from 'lucide-react';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: 'info' | 'warning' | 'success';
  read: boolean;
}

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: '1',
    title: 'New Online Order #1042',
    message: 'Table 4 placed an order for 3 items ($48.50)',
    timestamp: '2 mins ago',
    type: 'info',
    read: false
  },
  {
    id: '2',
    title: 'Low Stock Alert',
    message: 'Ribeye Steak inventory is below threshold (4 units remaining)',
    timestamp: '15 mins ago',
    type: 'warning',
    read: false
  },
  {
    id: '3',
    title: 'Shift Report Ready',
    message: 'Lunch shift summary report generated successfully',
    timestamp: '1 hour ago',
    type: 'success',
    read: false
  }
];

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const { activeBranchId, setActiveBranchId, branches, activeBranch, filterContext } = useBranchContext();

  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);

  const userMenuRef = useRef<HTMLDivElement>(null);
  const branchMenuRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
      setIsUserMenuOpen(false);
    }
    if (branchMenuRef.current && !branchMenuRef.current.contains(event.target as Node)) {
      setIsBranchDropdownOpen(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [handleClickOutside]);

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Ignore logout errors
    } finally {
      window.location.href = '/app';
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-white border-b border-gray-200 shadow-sm">
      <div className="flex items-center justify-between h-16 px-4 md:px-6">
        {/* Left Section: Logo & Brand */}
        <div className="flex items-center space-x-3">
          <Link to="/dashboard" className="flex items-center space-x-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#6D28D9] to-[#7C3AED] flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
              <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold tracking-tight text-gray-900 leading-none">
                URY <span className="text-[#7C3AED]">POS</span>
              </span>
              <span className="text-xs font-medium text-gray-500 mt-0.5">
                Dashboard Shell
              </span>
            </div>
          </Link>
        </div>

        {/* Right Section: Actions, Notifications, Branch Selector, User Profile */}
        <div className="flex items-center space-x-3">
          {/* Branch Selector Dropdown */}
          <div className="relative" ref={branchMenuRef}>
            <button
              onClick={() => setIsBranchDropdownOpen(!isBranchDropdownOpen)}
              className="flex items-center space-x-2 px-3 py-1.5 bg-purple-50 hover:bg-purple-100/80 border border-purple-200 rounded-xl text-sm font-medium text-[#7C3AED] transition-colors"
            >
              <Building2 className="w-4 h-4 text-[#7C3AED]" />
              <span className="max-w-[120px] sm:max-w-[160px] truncate">
                {activeBranchId === 'all' ? 'All Branches' : (activeBranch?.name || 'Select Branch')}
              </span>
              <ChevronDown className={`w-4 h-4 transition-transform ${isBranchDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isBranchDropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-200 py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Select Active Branch
                </div>

                <button
                  onClick={() => {
                    setActiveBranchId('all');
                    setIsBranchDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors ${
                    activeBranchId === 'all'
                      ? 'bg-purple-50 text-[#7C3AED] font-semibold'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Store className="w-4 h-4" />
                    <span>All Branches</span>
                  </div>
                  {activeBranchId === 'all' && <Check className="w-4 h-4 text-[#7C3AED]" />}
                </button>

                <div className="my-1 border-t border-gray-100" />

                {branches.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      setActiveBranchId(b.id);
                      setIsBranchDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors ${
                      activeBranchId === b.id
                        ? 'bg-purple-50 text-[#7C3AED] font-semibold'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <Building2 className="w-4 h-4 shrink-0" />
                      <span className="truncate">{b.name}</span>
                    </div>
                    {activeBranchId === b.id && <Check className="w-4 h-4 text-[#7C3AED] shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notifications Bell */}
          <button
            onClick={() => setIsNotificationOpen(true)}
            className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
            aria-label="Open notifications"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-[#7C3AED] rounded-full ring-2 ring-white" />
            )}
          </button>

          {/* User Menu Dropdown */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center space-x-2 p-1 rounded-xl hover:bg-gray-100 transition-colors"
            >
              <div className="relative">
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-[#7C3AED] font-bold flex items-center justify-center text-xs border border-purple-200">
                  AD
                </div>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-white" />
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
            </button>

            {isUserMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-900">Admin User</p>
                  <p className="text-xs text-gray-500 truncate">admin@urypos.com</p>
                  <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-semibold bg-purple-100 text-[#7C3AED] rounded-md">
                    POS Manager
                  </span>
                </div>

                <div className="py-1">
                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      navigate('/user');
                    }}
                    className="w-full flex items-center space-x-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <User className="w-4 h-4 text-gray-500" />
                    <span>User Profile</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      navigate('/report-settings');
                    }}
                    className="w-full flex items-center space-x-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Settings className="w-4 h-4 text-gray-500" />
                    <span>Report Settings</span>
                  </button>
                </div>

                <div className="border-t border-gray-100 py-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center space-x-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="w-4 h-4 text-red-500" />
                    <span>Log Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Notifications Slide-over Drawer */}
      {isNotificationOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div
            className="absolute inset-0 bg-gray-900/30 backdrop-blur-xs transition-opacity"
            onClick={() => setIsNotificationOpen(false)}
          />

          <div className="fixed inset-y-0 right-0 pl-10 max-w-full flex">
            <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col border-l border-gray-200">
              {/* Drawer Header */}
              <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
                <div className="flex items-center space-x-2">
                  <Bell className="w-5 h-5 text-[#7C3AED]" />
                  <h2 className="text-base font-semibold text-gray-900">Notifications</h2>
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 text-xs font-bold bg-[#7C3AED] text-white rounded-full">
                      {unreadCount}
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-xs font-medium text-[#7C3AED] hover:underline"
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    onClick={() => setIsNotificationOpen(false)}
                    className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200/50"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Drawer List */}
              <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    No new notifications
                  </div>
                ) : (
                  notifications.map((item) => (
                    <div
                      key={item.id}
                      className={`p-4 transition-colors ${
                        item.read ? 'bg-white' : 'bg-purple-50/40'
                      }`}
                    >
                      <div className="flex items-start space-x-3">
                        <div className="mt-0.5">
                          {item.type === 'info' && <Info className="w-5 h-5 text-blue-500" />}
                          {item.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-500" />}
                          {item.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                        </div>

                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                            <span className="text-xs text-gray-400">{item.timestamp}</span>
                          </div>
                          <p className="text-xs text-gray-600 mt-1">{item.message}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Drawer Footer */}
              <div className="p-4 border-t border-gray-200 bg-gray-50 text-center">
                <button
                  onClick={() => setIsNotificationOpen(false)}
                  className="w-full py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-300 rounded-xl bg-white hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
