/**
 * Menu Hooks
 */

import { useState, useEffect, useCallback } from 'react';
import { getPublicMenu, getRestaurantInfo, validateTableToken } from './menu-api';
import { MenuItem, RestaurantInfo, TableContext } from './types';

/**
 * Hook for fetching public menu
 */
export function usePublicMenu(restaurant: string, orderType?: string) {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMenu = useCallback(async () => {
    if (!restaurant) return;
    setLoading(true);
    try {
      const result = await getPublicMenu(restaurant, orderType);
      setMenu(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch menu');
    } finally {
      setLoading(false);
    }
  }, [restaurant, orderType]);

  useEffect(() => {
    fetchMenu();
  }, [fetchMenu]);

  return { menu, loading, error, refresh: fetchMenu };
}

/**
 * Hook for fetching restaurant info
 */
export function useRestaurantInfo(slug: string) {
  const [info, setInfo] = useState<RestaurantInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInfo = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const result = await getRestaurantInfo(slug);
      setInfo(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch restaurant info');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchInfo();
  }, [fetchInfo]);

  return { info, loading, error, refresh: fetchInfo };
}

/**
 * Hook for validating table token
 */
export function useTableToken(token: string | null) {
  const [context, setContext] = useState<TableContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await validateTableToken(token);
      setContext(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid table token');
      setContext(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    validate();
  }, [validate]);

  return { context, loading, error, refresh: validate };
}
