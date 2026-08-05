/**
 * @file useProjections.ts
 * @description React Hooks for Projection Cache. Isolates UI components from API,
 * IndexedDB, or Repository mechanics. Reads computed projections and updates automatically.
 */

import { useState, useEffect } from 'react';
import {
  getMenuProjection,
  getOrdersProjection,
  getTablesProjection,
  getAggregatorProjection,
  getCustomerProjection,
  projectionBus,
  type MenuProjectionData,
  type OrdersProjectionData,
  type TablesProjectionData,
  type AggregatorProjectionData,
  type CustomerProjectionData,
} from '@ury/core';

/**
 * 1. Menu Projection Hook
 */
export function useMenuProjection(categoryFilter?: string) {
  const [data, setData] = useState<MenuProjectionData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setLoading(true);
        const res = await getMenuProjection(categoryFilter);
        if (isMounted) setData(res);
      } catch (err) {
        console.error('Failed to load menu projection:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();

    const unsubscribe = projectionBus.subscribe(event => {
      if (event === 'MENU_UPDATED' || event === 'ALL_UPDATED') {
        load();
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [categoryFilter]);

  return { data, loading };
}

/**
 * 2. Orders Projection Hook
 */
export function useOrdersProjection(statusFilter?: any) {
  const [data, setData] = useState<OrdersProjectionData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setLoading(true);
        const res = await getOrdersProjection(statusFilter);
        if (isMounted) setData(res);
      } catch (err) {
        console.error('Failed to load orders projection:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();

    const unsubscribe = projectionBus.subscribe(event => {
      if (event === 'ORDERS_UPDATED' || event === 'ALL_UPDATED') {
        load();
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [statusFilter]);

  return { data, loading };
}

/**
 * 3. Tables Projection Hook
 */
export function useTablesProjection(roomFilter?: string) {
  const [data, setData] = useState<TablesProjectionData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setLoading(true);
        const res = await getTablesProjection(roomFilter);
        if (isMounted) setData(res);
      } catch (err) {
        console.error('Failed to load tables projection:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();

    const unsubscribe = projectionBus.subscribe(event => {
      if (event === 'TABLES_UPDATED' || event === 'ALL_UPDATED') {
        load();
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [roomFilter]);

  return { data, loading };
}

/**
 * 4. Aggregator Projection Hook
 */
export function useAggregatorProjection() {
  const [data, setData] = useState<AggregatorProjectionData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setLoading(true);
        const res = await getAggregatorProjection();
        if (isMounted) setData(res);
      } catch (err) {
        console.error('Failed to load aggregator projection:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();

    const unsubscribe = projectionBus.subscribe(event => {
      if (event === 'AGGREGATORS_UPDATED' || event === 'ALL_UPDATED') {
        load();
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  return { data, loading };
}

/**
 * 5. Customer Projection Hook
 */
export function useCustomerProjection(searchQuery?: string) {
  const [data, setData] = useState<CustomerProjectionData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setLoading(true);
        const res = await getCustomerProjection(searchQuery);
        if (isMounted) setData(res);
      } catch (err) {
        console.error('Failed to load customer projection:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();

    const unsubscribe = projectionBus.subscribe(event => {
      if (event === 'CUSTOMERS_UPDATED' || event === 'ALL_UPDATED') {
        load();
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [searchQuery]);

  return { data, loading };
}
