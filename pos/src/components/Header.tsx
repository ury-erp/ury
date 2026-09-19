import { useState, useEffect, useRef } from 'react';
import { t } from '../i18n';
import { clearCachedStorage } from '../lib/storage-keys';
import { Link, useLocation } from 'react-router-dom';
import {
  Command,
  MessageSquare,
  User,
  ChevronDown,
  Monitor,
  LogOut,
  RefreshCw,
  Lock,
  Search,
  CircleHelp,
} from 'lucide-react';
import { Button, Input } from '@ury/ui';
import LanguageSwitcher from './LanguageSwitcher';
import KitchenMessageDialog from './KitchenMessageDialog';
import { useRootStore } from '../store/root-store';
import { usePOSStore } from '../store/pos-store';
import type { RootState } from '../store/root-store';
import { logout } from '@ury/core';
import { showToast } from '@ury/ui';
import smartLogo from '../../../smart_logo.png';

const Header = () => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showKitchenMessage, setShowKitchenMessage] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const user = useRootStore((state: RootState) => state.user);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const { searchQuery, setSearchQuery, tableSearchQuery, setTableSearchQuery, setShowVoluntaryClosing } = usePOSStore();
  const { orderSearchQuery, setOrderSearchQuery } = useRootStore();
  const [orderSearchInput, setOrderSearchInput] = useState(orderSearchQuery);

  // Determine placeholder and handlers based on route
  let searchPlaceholder = t('header.search_placeholder_default');
  let searchValue: string | undefined = undefined;
  let searchOnChange: ((e: React.ChangeEvent<HTMLInputElement>) => void) | undefined = undefined;
  if (location.pathname === '/orders') {
    searchPlaceholder = t('header.search_placeholder_orders');
    searchValue = orderSearchInput;
    searchOnChange = (e) => setOrderSearchInput(e.target.value);
  } else if (location.pathname === '/pos') {
    searchPlaceholder = t('header.search_placeholder_menu');
    searchValue = searchQuery;
    searchOnChange = (e) => setSearchQuery(e.target.value);
  } else if (location.pathname === '/tables') {
    // The box was rendered here but bound to nothing, so typing in it looked
    // like a filter and did nothing at all (UX-05).
    searchPlaceholder = t('header.search_placeholder_tables');
    searchValue = tableSearchQuery;
    searchOnChange = (e) => setTableSearchQuery(e.target.value);
  }

  // Debounce order search
  useEffect(() => {
    if (location.pathname !== '/orders') return;
    const handler = setTimeout(() => {
      setOrderSearchQuery(orderSearchInput);
    }, 300);
    return () => clearTimeout(handler);
  }, [orderSearchInput, setOrderSearchQuery, location.pathname]);

  // Keep input in sync with store (if cleared elsewhere)
  useEffect(() => {
    if (location.pathname === '/orders') {
      setOrderSearchInput(orderSearchQuery);
    }
  }, [location.pathname, orderSearchQuery]);

  // Handle clicks outside of menus
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleUserMenuToggle = () => {
    setShowUserMenu(!showUserMenu);
  };

  const handleLogout = async () => {
    try {
      await logout();
      window.location.href = '/login?redirect-to=%2Fpos';
    } catch (error) {
      showToast.error(t('errors.failed_logout'));
    }
  };

  const handleClearCache = () => {
    // Only the re-fetchable entries. `localStorage.clear()` also took
    // `posOrderTabsData` — the open tabs and their unsent lines — so the
    // button a cashier presses when a screen looks stale deleted the order
    // they were building (UX-04). See lib/storage-keys.ts for the split.
    clearCachedStorage();
    window.location.reload();
  };

  const handleCloseShift = () => {
    setShowUserMenu(false);
    setShowVoluntaryClosing(true);
  };

  return (
    <header className="bg-[#241914] text-white border-b border-[#3d2a22] shadow-[0_5px_18px_rgba(36,25,20,0.16)]">
      <div className="flex items-center justify-between h-[4.5rem] px-5 gap-5">
        {/* Logo */}
        <div className="flex items-center">
        <Link to="/dashboard" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm">
              <img src={smartLogo} alt="Smart Restro" className="h-8 w-8 object-contain" />
            </span>
            <span className="hidden sm:block text-lg font-bold tracking-tight text-white">Smart <span className="text-[#ffca4b]">Restro</span></span>
          </Link>
        </div>

        {/* Search Bar */}
        {location.pathname !== '/dashboard' ? (
          <div className="px-4 py-2.5 flex-1 flex items-center max-w-2xl mx-auto bg-white/10 hover:bg-white/15 border border-white/15 rounded-xl transition-colors">
            <Search className="w-4 h-4 text-[#ffca4b] me-3 shrink-0" />
            <Input
              ref={searchInputRef}
              placeholder={searchPlaceholder}
              className="h-fit p-0 w-full bg-transparent border-0 text-white placeholder:text-white/55 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
              value={searchValue}
              onChange={searchOnChange}
            />
            <div className="flex items-center gap-2 text-gray-400">
              <Command className="w-4 h-4 text-white/50" />
              <span className="text-white/50">K</span>
            </div>
          </div>
        ) : (
          <div className="flex-1" />
        )}

        {/* Right side actions */}
        <div className="flex items-center gap-2">
          {/* Reachable in one tap mid-service, alongside the other header
              actions, rather than buried in the user menu. */}
          <button
            onClick={() => setShowKitchenMessage(true)}
            title={t('kitchen_msg.open')}
            aria-label={t('kitchen_msg.open')}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white/65 hover:bg-white/10 hover:text-white transition-colors duration-fast press"
          >
            <MessageSquare className="w-4 h-4" />
          </button>
          <button className="hidden md:flex h-9 w-9 items-center justify-center rounded-lg text-white/65 hover:bg-white/10 hover:text-white transition-colors" title={t('header.help')}>
            <CircleHelp className="w-4 h-4" />
          </button>
          {/* User menu */}
          <div className="relative" ref={userMenuRef}>
            <Button
              onClick={handleUserMenuToggle}
              variant="ghost"
              className="flex items-center gap-2 text-white/80 hover:bg-white/10 hover:text-white"
            >
              <div className="w-9 h-9 bg-[#f05b42] rounded-xl flex items-center justify-center shadow-inner">
                <User className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-medium">{user?.full_name || 'User'}</span>
              <ChevronDown className="w-4 h-4 text-white/60" />
            </Button>

            {/* User dropdown */}
            {showUserMenu && (
              <div className="absolute end-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                <div className="p-4 border-b border-gray-200">
                  <p className="text-sm font-medium text-gray-900">{user?.full_name || 'User'}</p>
                  <p className="text-sm text-gray-500">{user?.name || ''}</p>
                </div>
                <div className="py-2">
                  <Button
                    variant="ghost"
                    className="flex justify-start items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    onClick={handleCloseShift}
                  >
                    <Lock className="w-4 h-4 me-3" />
                    {t('header.close_shift')}
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex justify-start items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    onClick={() => window.location.href = '/ury/dashboard'}
                  >
                    <Monitor className="w-4 h-4 me-3" />
                    {t('header.switch_to_dashboard')}
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex justify-start items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    onClick={() => window.location.href = '/app'}
                  >
                    <Monitor className="w-4 h-4 me-3" />
                    {t('header.switch_to_desk')}
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex justify-start items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    onClick={handleClearCache}
                  >
                    <RefreshCw className="w-4 h-4 me-3" />
                    {t('header.clear_cache')}
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex justify-start items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
                    onClick={handleLogout}
                  >
                    <LogOut className="w-4 h-4 me-3" />
                    {t('header.logout')}
                  </Button>
                  <LanguageSwitcher />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <KitchenMessageDialog
        open={showKitchenMessage}
        onOpenChange={setShowKitchenMessage}
      />
    </header>
  );
};

export default Header; 