import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAccess } from '../../hooks/useAccess';
import { Link } from 'react-router-dom';
import { useBranchContext } from '../../context/BranchContext';
import { logout, getLoggedUser, getUserRoles } from '@ury/core';
import { t } from '../../i18n';
import { LanguageSwitcher } from './LanguageSwitcher';
import { NotificationMenu } from './NotificationMenu';
import smartLogo from '../../../../smart_logo.png';
import {
  User,
  ChevronDown,
  LogOut,
  Store,
  Building2,
  Check,
  Monitor,
  RefreshCw
} from 'lucide-react';

export const Header: React.FC = () => {
  const { access } = useAccess();
  const { activeBranchId, setActiveBranchId, branches, activeBranch } = useBranchContext();

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const [userInfo, setUserInfo] = useState({ fullName: 'Admin User', email: 'admin@smartrestro.com' });

  const userMenuRef = useRef<HTMLDivElement>(null);
  const branchMenuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userId = await getLoggedUser();
        if (userId) {
          const roles = await getUserRoles(userId);
          setUserInfo({
            fullName: roles.full_name || 'Admin User',
            email: userId
          });
        }
      } catch (e) {
        console.error('Failed to fetch user', e);
      }
    };
    fetchUser();
  }, []);

  const handleClearCache = () => {
    // Clear all local storage
    localStorage.clear();
    // Clear all session storage
    sessionStorage.clear();
    // Reload the page
    window.location.reload();
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Ignore logout errors
    } finally {
      window.location.href = '/login?redirect-to=%2Fpos';
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-[#fffdf8]/95 backdrop-blur border-b border-[#eadfce] shadow-[0_1px_0_rgba(74,48,30,0.04)]">
      <div className="flex items-center justify-between h-16 px-4 md:px-6">
        {/* Left Section: Logo & Brand */}
        <div className="flex items-center space-x-3">
          <Link to="/dashboard" className="flex items-center space-x-3 group">
            <img src={smartLogo} alt="Smart Restro" className="h-10 w-10 object-contain" />
            <span className="text-lg font-bold tracking-tight text-[#3f2a20]">Smart <span className="text-primary">Restro</span></span>
          </Link>
        </div>

        {/* Right Section: Actions, Notifications, Branch Selector, User Profile */}
        <div className="flex items-center space-x-3">
          {/* Branch Selector Dropdown */}
          <div className="relative" ref={branchMenuRef}>
            <button
              onClick={() => setIsBranchDropdownOpen(!isBranchDropdownOpen)}
              className="flex items-center space-x-2 px-3 py-1.5 bg-blue-50 hover:bg-blue-100/80 border border-blue-200 rounded-md text-sm font-medium text-primary transition-colors"
            >
              <Building2 className="w-4 h-4 text-primary" />
              <span className="max-w-[120px] sm:max-w-[160px] truncate">
                {activeBranchId === 'all' ? t('branch.all_branches') : (activeBranch?.name || t('branch.select_branch'))}
              </span>
              <ChevronDown className={`w-4 h-4 transition-transform ${isBranchDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isBranchDropdownOpen && (
              <div className="absolute end-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-200 py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {t('branch.select_active_branch')}
                </div>

                <button
                  onClick={() => {
                    setActiveBranchId('all');
                    setIsBranchDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm text-start transition-colors ${
                    activeBranchId === 'all'
                      ? 'bg-blue-50 text-primary font-semibold'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Store className="w-4 h-4" />
                    <span>{t('branch.all_branches')}</span>
                  </div>
                  {activeBranchId === 'all' && <Check className="w-4 h-4 text-primary" />}
                </button>

                <div className="my-1 border-t border-gray-100" />

                {branches.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      setActiveBranchId(b.id);
                      setIsBranchDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm text-start transition-colors ${
                      activeBranchId === b.id
                        ? 'bg-blue-50 text-primary font-semibold'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <span className="truncate">{b.name}</span>
                    </div>
                    {activeBranchId === b.id && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notifications */}
          <NotificationMenu />

          {/* User Menu Dropdown */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center gap-2 p-1 rounded-xl hover:bg-gray-100 transition-colors text-gray-600 hover:text-gray-900"
            >
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-medium">{userInfo.fullName}</span>
              <ChevronDown className="w-4 h-4 text-gray-500" />
            </button>

            {isUserMenuOpen && (
              <div className="absolute end-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                <div className="p-4 border-b border-gray-200">
                  <p className="text-sm font-medium text-gray-900">{userInfo.fullName}</p>
                  <p className="text-sm text-gray-500 truncate">{userInfo.email}</p>
                </div>

                <div className="py-2">
                  {access.desk && <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      window.location.href = '/app';
                    }}
                    className="w-full flex items-center space-x-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <Monitor className="w-4 h-4" />
                    <span>{t('header.switch_to_desk')}</span>
                  </button>}

                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      handleClearCache();
                    }}
                    className="w-full flex items-center space-x-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>{t('header.clear_cache')}</span>
                  </button>

                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center space-x-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="w-4 h-4 text-red-500" />
                    <span>{t('header.logout')}</span>
                  </button>

                  <LanguageSwitcher />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

    </header>
  );
};
