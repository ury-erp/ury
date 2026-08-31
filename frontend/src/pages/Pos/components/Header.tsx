import { useState, useEffect, useRef } from 'react';
import { t } from '../i18n';
import { Link, useLocation } from 'react-router-dom';
import {
  Command,
  ChevronDown,
  ExternalLink,
  LogOut,
  RefreshCw,
} from 'lucide-react';
import { Button, Input, buttonVariants } from '@ury/ui';
import { useRootStore } from '../store/root-store';
import { usePOSStore } from '../store/pos-store';
import type { RootState } from '../store/root-store';
import { logout } from '@ury/core';
import { showToast } from '@ury/ui';

const Header = () => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const user = useRootStore((state: RootState) => state.user);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const { searchQuery, setSearchQuery } = usePOSStore();
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
    // Clear all local storage
    localStorage.clear();
    // Clear all session storage
    sessionStorage.clear();
    // Reload the page
    window.location.reload();
  };

  return (
    <header className="bg-background border-b border-hair">
      <div className="flex items-center justify-between h-[52px] px-[18px] gap-3">
        {/* Logo */}
        <div className="flex items-center">
          <Link to="/pos/dashboard" className="flex items-center gap-3" aria-label={t('header.shift_overview')} title={t('header.shift_overview')}>
            <img
              src="/assets/ury/pos/ury_pos.png"
              alt="URY POS"
              className="h-5 w-auto"
            />
          </Link>
        </div>

        {/* Search Bar */}
        <div className="flex-1 flex items-center gap-[7px] h-7 px-[9px] bg-muted rounded-[7px] text-text-tertiary text-sm w-[280px]">
          <Input
            ref={searchInputRef}
            placeholder={searchPlaceholder}
            className="h-fit p-0 w-full bg-transparent border-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm placeholder:text-text-tertiary"
            value={searchValue}
            onChange={searchOnChange}
          />
          {location.pathname === '/pos' && (
            <div className="flex items-center gap-[3px] font-mono text-[10px] text-text-quaternary ms-auto flex-none">
              <Command className="w-3 h-3" />
              <span>K</span>
            </div>
          )}
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-3">
          {/*
            Cross-app jump into the management SPA. Styled to mirror the
            management app's own "Open POS" button (solid primary + external
            icon) so the same gesture looks the same in both directions, and so
            it reads as leaving the POS rather than as another POS tab.
          */}
          <a
            href="/ury/dashboard"
            title={`${t('header.service_board')} (opens the management app)`}
            className={buttonVariants({ variant: 'chrome', size: 'compact' })}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>{t('header.service_board')}</span>
          </a>

          {/* User menu */}
          <div className="relative" ref={userMenuRef}>
            <Button
              onClick={handleUserMenuToggle}
              variant="ghost"
              className="flex items-center gap-[7px] h-7 px-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-[7px]"
            >
              <div className="w-[22px] h-[22px] bg-primary-tint text-primary rounded-full flex items-center justify-center text-[10px] font-semibold flex-none">
                {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'U'}
              </div>
              <span className="text-xs font-medium">{user?.full_name || 'User'}</span>
              <ChevronDown className="w-3 h-3 flex-none" />
            </Button>

            {/* User dropdown */}
            {showUserMenu && (
              <div className="absolute end-0 mt-2 w-56 bg-card rounded-[9px] shadow-lg border border-hair z-50">
                <div className="p-4 border-b border-hair">
                  <p className="text-xs font-medium text-foreground">{user?.full_name || 'User'}</p>
                  <p className="text-xs text-text-tertiary">{user?.name || ''}</p>
                </div>
                <div className="py-2">
                  <Button
                    variant="ghost"
                    className="flex justify-start items-center w-full px-4 py-2 text-xs text-muted-foreground hover:bg-muted transition-colors"
                    onClick={handleClearCache}
                  >
                    <RefreshCw className="w-4 h-4 me-3" />
                    {t('header.clear_cache')}
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex justify-start items-center w-full px-4 py-2 text-xs text-destructive hover:bg-destructive-tint hover:text-destructive transition-colors"
                    onClick={handleLogout}
                  >
                    <LogOut className="w-4 h-4 me-3" />
                    {t('header.logout')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header; 