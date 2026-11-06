import { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import { call } from '@ury/core';
import { nextId } from '../utils/id';
import { uniqueShortCode, generateTableNames, isAutoTableName } from '../utils/shortCode';

export interface BranchData {
  branchName: string;
  invoicePrefix: string;
  takesAggregatorOrders: boolean;
  aggregatorPrefix: string;
  taxId: string;
}

export interface RoomData {
  id: string;
  name: string;
  tableCount: number;
  /** Short code derived from the room name, used to auto-name its tables (e.g. "Emerald Ground" -> "EG"). */
  prefix: string;
}

export interface TableData {
  id: string;
  name: string;
  seats: number;
  /** Room name (matches URY Room.name / URY Table.restaurant_room on the backend). */
  room: string;
  /** True while the table's name still matches its room's auto-generated pattern (e.g. "EG-03"). */
  auto: boolean;
}

export interface MenuItemData {
  id: string;
  name: string;
  course: string;
  price: number;
}

export interface TaxConfigData {
  taxType: 'Inclusive' | 'Exclusive';
  taxPercentage: number;
}

export interface PaymentMethodData {
  id: string;
  name: string;
}

export interface UserData {
  id: string;
  email: string;
  name: string;
  passwordPlaceholder: string;
  role: string;
}

export type SectionId = 'branch' | 'rooms' | 'tables' | 'menu' | 'payment' | 'users';

export const SECTION_ORDER: SectionId[] = ['branch', 'rooms', 'tables', 'menu', 'payment', 'users'];

/** Sections with no safe "use the defaults" floor — an empty payment-methods
 * list or empty menu breaks POS Profile creation, so these can't be skipped,
 * only edited (they always carry at least their seeded default row). */

export function generateRandomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let pwd = '';
  for (let i = 0; i < 8; i += 1) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `Pass@${pwd}`;
}

export interface ConfigureState {
  activeSection: SectionId;
  visitedSections: Set<SectionId>;
  completedSections: Set<SectionId>;
  branch: BranchData;
  rooms: RoomData[];
  tables: TableData[];
  menuItems: MenuItemData[];
  menuFile: File | null;
  taxConfig: TaxConfigData;
  paymentMethods: PaymentMethodData[];
  users: UserData[];
}

export interface ConfigureContextType extends ConfigureState {
  setActiveSection: (section: SectionId) => void;
  markSectionCompleted: (section?: SectionId) => void;
  /** Marks the section complete using its current (possibly untouched, seeded) values and advances — the "Use the defaults" affordance. */
  useDefaultsForSection: (section?: SectionId) => void;
  goToNextSection: () => void;
  goToPrevSection: () => void;

  updateBranch: (data: Partial<BranchData>) => void;

  addRoom: (name: string, tableCount: number) => void;
  renameRoom: (id: string, newName: string) => void;
  deleteRoom: (id: string) => void;
  /** Tables that would be removed if this room's count were set to newCount (empty if growing/unchanged). */
  previewShrink: (roomId: string, newCount: number) => TableData[];
  /** Applies a table-count change. Growing always succeeds. Shrinking requires confirmedRemovalIds to exactly match previewShrink's result. */
  setRoomTableCount: (roomId: string, newCount: number, confirmedRemovalIds?: string[]) => void;

  renameTable: (id: string, name: string) => void;
  updateTableSeats: (id: string, seats: number) => void;
  setSeatsForRoom: (roomId: string, seats: number) => void;
  deleteTable: (id: string) => void;

  addMenuItem: (item: Omit<MenuItemData, 'id'>) => void;
  addMenuItems: (items: Omit<MenuItemData, 'id'>[]) => void;
  updateMenuItem: (id: string, item: Partial<MenuItemData>) => void;
  deleteMenuItem: (id: string) => void;

  setMenuFile: (file: File | null) => void;
  updateTaxConfig: (config: Partial<TaxConfigData>) => void;

  addPaymentMethod: (method: Omit<PaymentMethodData, 'id'>) => void;
  updatePaymentMethod: (id: string, method: Partial<PaymentMethodData>) => void;
  deletePaymentMethod: (id: string) => void;

  addUser: (user: Omit<UserData, 'id'>) => void;
  updateUser: (id: string, user: Partial<UserData>) => void;
  deleteUser: (id: string) => void;
}

const ConfigureContext = createContext<ConfigureContextType | undefined>(undefined);

const SESSION_STORAGE_KEY = 'ury.setup.configureState';

function loadPersisted(): Partial<ConfigureState> | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function ConfigureProvider({ children }: { children: ReactNode }) {
  const persisted = loadPersisted();

  const [activeSection, setActiveSectionState] = useState<SectionId>(
    (persisted?.activeSection as SectionId) || 'branch'
  );
  const [visitedSections, setVisitedSections] = useState<Set<SectionId>>(new Set(['branch']));
  const [completedSections, setCompletedSections] = useState<Set<SectionId>>(new Set());

  const [branch, setBranch] = useState<BranchData>(
    persisted?.branch || {
      branchName: '',
      invoicePrefix: 'INV-',
      takesAggregatorOrders: false,
      aggregatorPrefix: 'AGG-',
      taxId: '',
    }
  );

  const [rooms, setRooms] = useState<RoomData[]>(
    persisted?.rooms || [{ id: nextId('room'), name: 'Main Dining', tableCount: 4, prefix: 'MD' }]
  );

  const [tables, setTables] = useState<TableData[]>(
    persisted?.tables ||
      generateTableNames('MD', 4).map((name) => ({
        id: nextId('table'),
        name,
        seats: 4,
        room: 'Main Dining',
        auto: true,
      }))
  );

  const [menuItems, setMenuItems] = useState<MenuItemData[]>(
    persisted?.menuItems || [
      { id: nextId('menu'), name: 'Pizza',   course: 'Main Course', price: 250 },
      { id: nextId('menu'), name: 'Burger',  course: 'Main Course', price: 180 },
      { id: nextId('menu'), name: 'Fries',   course: 'Starters',   price: 80  },
      { id: nextId('menu'), name: 'Wings',   course: 'Starters',   price: 120 },
      { id: nextId('menu'), name: 'Coffee',  course: 'Beverages',  price: 60  },
    ]
  );

  const [menuFile, setMenuFileState] = useState<File | null>(null);

  const [taxConfig, setTaxConfig] = useState<TaxConfigData>(
    persisted?.taxConfig || { taxType: 'Inclusive', taxPercentage: 5 }
  );

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodData[]>(
    persisted?.paymentMethods || [{ id: nextId('pm'), name: 'Cash' }]
  );

  const [users, setUsers] = useState<UserData[]>(
    persisted?.users || [
      {
        id: nextId('user'),
        email: 'cashier@example.com',
        name: 'Cashier',
        passwordPlaceholder: generateRandomPassword(),
        role: 'URY Cashier',
      },
    ]
  );

  useEffect(() => {
    async function loadCompanyDefault() {
      try {
        const res = await call<any>('ury.ury.api.minimal.business_setup.get_business_setup');
        const companyName = res?.message?.company || res?.company || res?.message?.data?.company || res?.data?.company;
        if (companyName && !persisted?.branch?.branchName) {
          setBranch((prev) => ({ ...prev, branchName: companyName }));
        }
      } catch (err) {
        console.error('Failed to load company name', err);
      }
    }
    loadCompanyDefault();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist to sessionStorage so a mid-wizard refresh doesn't lose progress
  // (report §5.5 / final-plan Phase 3e — wizard resumability).
  useEffect(() => {
    const snapshot: Partial<ConfigureState> = {
      activeSection,
      branch,
      rooms,
      tables,
      menuItems,
      taxConfig,
      paymentMethods,
      users,
    };
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // sessionStorage unavailable (private mode, quota) — non-fatal
    }
  }, [activeSection, branch, rooms, tables, menuItems, taxConfig, paymentMethods, users]);

  const setActiveSection = useCallback((section: SectionId) => {
    setActiveSectionState(section);
    setVisitedSections((prev) => new Set(prev).add(section));
  }, []);

  const markSectionCompleted = useCallback(
    (section?: SectionId) => {
      const sec = section || activeSection;
      setCompletedSections((prev) => new Set(prev).add(sec));
      setVisitedSections((prev) => new Set(prev).add(sec));
    },
    [activeSection]
  );

  const useDefaultsForSection = useCallback(
    (section?: SectionId) => {
      const sec = section || activeSection;
      markSectionCompleted(sec);
      const currentIndex = SECTION_ORDER.indexOf(sec);
      if (currentIndex >= 0 && currentIndex < SECTION_ORDER.length - 1) {
        setActiveSection(SECTION_ORDER[currentIndex + 1]);
      }
    },
    [activeSection, markSectionCompleted, setActiveSection]
  );

  const goToNextSection = useCallback(() => {
    markSectionCompleted(activeSection);
    const currentIndex = SECTION_ORDER.indexOf(activeSection);
    if (currentIndex < SECTION_ORDER.length - 1) {
      setActiveSection(SECTION_ORDER[currentIndex + 1]);
    }
  }, [activeSection, markSectionCompleted, setActiveSection]);

  const goToPrevSection = useCallback(() => {
    const currentIndex = SECTION_ORDER.indexOf(activeSection);
    if (currentIndex > 0) {
      setActiveSection(SECTION_ORDER[currentIndex - 1]);
    }
  }, [activeSection, setActiveSection]);

  const updateBranch = useCallback((data: Partial<BranchData>) => {
    setBranch((prev) => ({ ...prev, ...data }));
  }, []);

  // ---- Rooms / Tables -----------------------------------------------------

  const addRoom = useCallback(
    (name: string, tableCount: number) => {
      const taken = new Set(rooms.map((r) => r.prefix));
      const prefix = uniqueShortCode(name, taken);
      const roomId = nextId('room');
      const count = Math.max(0, tableCount);

      setRooms((prev) => [...prev, { id: roomId, name, tableCount: count, prefix }]);

      if (count > 0) {
        const names = generateTableNames(prefix, count);
        setTables((prev) => [
          ...prev,
          ...names.map((tableName) => ({ id: nextId('table'), name: tableName, seats: 4, room: name, auto: true })),
        ]);
      }
    },
    [rooms]
  );

  const renameRoom = useCallback((id: string, newName: string) => {
    setRooms((prevRooms) => {
      const room = prevRooms.find((r) => r.id === id);
      if (!room || room.name === newName) return prevRooms;

      const taken = new Set(prevRooms.filter((r) => r.id !== id).map((r) => r.prefix));
      const newPrefix = uniqueShortCode(newName, taken);
      const oldName = room.name;
      const oldPrefix = room.prefix;

      setTables((prevTables) => {
        // Renumber only tables still matching this room's auto pattern; leave
        // manually-renamed tables' names alone, but always fix the room link
        // (a stale link is a hard "reqd Link" failure server-side).
        const roomTables = prevTables.filter((t) => t.room === oldName);
        const autoTables = roomTables.filter((t) => t.auto && isAutoTableName(t.name, oldPrefix));
        const newNames = generateTableNames(newPrefix, autoTables.length);
        let autoIdx = 0;

        return prevTables.map((t) => {
          if (t.room !== oldName) return t;
          if (t.auto && isAutoTableName(t.name, oldPrefix)) {
            const renamed = { ...t, room: newName, name: newNames[autoIdx] };
            autoIdx += 1;
            return renamed;
          }
          return { ...t, room: newName };
        });
      });

      return prevRooms.map((r) => (r.id === id ? { ...r, name: newName, prefix: newPrefix } : r));
    });
  }, []);

  const deleteRoom = useCallback((id: string) => {
    setRooms((prevRooms) => {
      const room = prevRooms.find((r) => r.id === id);
      if (room) {
        setTables((prevTables) => prevTables.filter((t) => t.room !== room.name));
      }
      return prevRooms.filter((r) => r.id !== id);
    });
  }, []);

  const previewShrink = useCallback(
    (roomId: string, newCount: number): TableData[] => {
      const room = rooms.find((r) => r.id === roomId);
      if (!room) return [];
      const roomTables = tables.filter((t) => t.room === room.name);
      if (newCount >= roomTables.length) return [];
      return roomTables.slice(newCount);
    },
    [rooms, tables]
  );

  const setRoomTableCount = useCallback(
    (roomId: string, newCount: number, confirmedRemovalIds?: string[]) => {
      const room = rooms.find((r) => r.id === roomId);
      if (!room) return;
      const roomTables = tables.filter((t) => t.room === room.name);
      const count = Math.max(0, newCount);

      if (count >= roomTables.length) {
        // Growing (or unchanged): always safe, append new auto tables.
        const toAdd = count - roomTables.length;
        if (toAdd > 0) {
          const highestAutoIndex = roomTables
            .filter((t) => t.auto && isAutoTableName(t.name, room.prefix))
            .reduce((max, t) => Math.max(max, parseInt(t.name.split('-').pop() || '0', 10)), 0);
          const startIndex = Math.max(highestAutoIndex + 1, roomTables.length + 1);
          const newNames = generateTableNames(room.prefix, toAdd, startIndex);
          setTables((prev) => [
            ...prev,
            ...newNames.map((name) => ({ id: nextId('table'), name, seats: 4, room: room.name, auto: true })),
          ]);
        }
        setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, tableCount: count } : r)));
        return;
      }

      // Shrinking: only apply if the caller confirmed exactly the trailing
      // tables that would be removed (never silently drop data — plan D-Q3).
      const toRemove = roomTables.slice(count);
      const toRemoveIds = new Set(toRemove.map((t) => t.id));
      const confirmedSet = new Set(confirmedRemovalIds || []);
      const matches =
        toRemove.length > 0 && toRemove.every((t) => confirmedSet.has(t.id)) && confirmedSet.size === toRemoveIds.size;
      if (!matches) return;

      setTables((prev) => prev.filter((t) => !toRemoveIds.has(t.id)));
      setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, tableCount: count } : r)));
    },
    [rooms, tables]
  );

  const renameTable = useCallback((id: string, name: string) => {
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, name, auto: false } : t)));
  }, []);

  const updateTableSeats = useCallback((id: string, seats: number) => {
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, seats } : t)));
  }, []);

  const setSeatsForRoom = useCallback(
    (roomId: string, seats: number) => {
      const room = rooms.find((r) => r.id === roomId);
      if (!room) return;
      setTables((prev) => prev.map((t) => (t.room === room.name ? { ...t, seats } : t)));
    },
    [rooms]
  );

  const deleteTable = useCallback((id: string) => {
    setTables((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ---- Menu / Payment / Users ---------------------------------------------

  const addMenuItem = useCallback((item: Omit<MenuItemData, 'id'>) => {
    setMenuItems((prev) => [...prev, { ...item, id: nextId('menu') }]);
  }, []);

  const addMenuItems = useCallback((items: Omit<MenuItemData, 'id'>[]) => {
    setMenuItems((prev) => [...prev, ...items.map((item) => ({ ...item, id: nextId('menu') }))]);
  }, []);

  const updateMenuItem = useCallback((id: string, item: Partial<MenuItemData>) => {
    setMenuItems((prev) => prev.map((m) => (m.id === id ? { ...m, ...item } : m)));
  }, []);

  const deleteMenuItem = useCallback((id: string) => {
    setMenuItems((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const setMenuFile = useCallback((file: File | null) => {
    setMenuFileState(file);
  }, []);

  const updateTaxConfig = useCallback((config: Partial<TaxConfigData>) => {
    setTaxConfig((prev) => ({ ...prev, ...config }));
  }, []);

  const addPaymentMethod = useCallback((method: Omit<PaymentMethodData, 'id'>) => {
    setPaymentMethods((prev) => [...prev, { ...method, id: nextId('pm') }]);
  }, []);

  const updatePaymentMethod = useCallback((id: string, method: Partial<PaymentMethodData>) => {
    setPaymentMethods((prev) => prev.map((p) => (p.id === id ? { ...p, ...method } : p)));
  }, []);

  const deletePaymentMethod = useCallback((id: string) => {
    setPaymentMethods((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const addUser = useCallback((user: Omit<UserData, 'id'>) => {
    setUsers((prev) => [...prev, { ...user, id: nextId('user') }]);
  }, []);

  const updateUser = useCallback((id: string, user: Partial<UserData>) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...user } : u)));
  }, []);

  const deleteUser = useCallback((id: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== id));
  }, []);

  return (
    <ConfigureContext.Provider
      value={{
        activeSection,
        visitedSections,
        completedSections,
        branch,
        rooms,
        tables,
        menuItems,
        menuFile,
        taxConfig,
        paymentMethods,
        users,
        setActiveSection,
        markSectionCompleted,
        useDefaultsForSection,
        goToNextSection,
        goToPrevSection,
        updateBranch,
        addRoom,
        renameRoom,
        deleteRoom,
        previewShrink,
        setRoomTableCount,
        renameTable,
        updateTableSeats,
        setSeatsForRoom,
        deleteTable,
        addMenuItem,
        addMenuItems,
        updateMenuItem,
        deleteMenuItem,
        setMenuFile,
        updateTaxConfig,
        addPaymentMethod,
        updatePaymentMethod,
        deletePaymentMethod,
        addUser,
        updateUser,
        deleteUser,
      }}
    >
      {children}
    </ConfigureContext.Provider>
  );
}

export function useConfigure() {
  const context = useContext(ConfigureContext);
  if (!context) {
    throw new Error('useConfigure must be used within a ConfigureProvider');
  }
  return context;
}
