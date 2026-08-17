import { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';

function generateSecurePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  let pwd = '';
  for (let i = 0; i < 8; i++) {
    pwd += chars[array[i] % chars.length];
  }
  return `Pass@${pwd}`;
}
import { call } from '@ury/core';

export interface BranchData {
  branchName: string;
  invoicePrefix: string;
  aggregatorPrefix: string;
  taxId: string;
}

export interface RoomData {
  id: string;
  name: string;
  type: string;
  branch: string;
}

export interface TableData {
  id: string;
  name: string;
  seats: number;
  branch: string;
  room: string;
  shape: 'Square' | 'Rectangle' | 'Round';
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
  skipSection: (section?: SectionId) => void;
  goToNextSection: () => void;
  goToPrevSection: () => void;

  updateBranch: (data: Partial<BranchData>) => void;

  addRoom: (room: Omit<RoomData, 'id'>) => void;
  updateRoom: (id: string, room: Partial<RoomData>) => void;
  deleteRoom: (id: string) => void;

  addTable: (table: Omit<TableData, 'id'>) => void;
  updateTable: (id: string, table: Partial<TableData>) => void;
  deleteTable: (id: string) => void;

  addMenuItem: (item: Omit<MenuItemData, 'id'>) => void;
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

export function ConfigureProvider({ children }: { children: ReactNode }) {
  const [activeSection, setActiveSectionState] = useState<SectionId>('branch');
  const [visitedSections, setVisitedSections] = useState<Set<SectionId>>(new Set(['branch']));
  const [completedSections, setCompletedSections] = useState<Set<SectionId>>(new Set());

  const [branch, setBranch] = useState<BranchData>({
    branchName: '',
    invoicePrefix: 'INV-',
    aggregatorPrefix: 'AGG-',
    taxId: ''
  });

  const [rooms, setRooms] = useState<RoomData[]>([
    { id: '1', name: 'Main Dining', type: 'AC', branch: '' }
  ]);

  const [tables, setTables] = useState<TableData[]>([
    { id: '1', name: 'T-01', seats: 4, branch: '', room: 'Main Dining', shape: 'Square' }
  ]);

  const [menuItems, setMenuItems] = useState<MenuItemData[]>([
    { id: '1', name: 'Chicken Biriyani', course: 'Main Course', price: 250 }
  ]);

  const [menuFile, setMenuFileState] = useState<File | null>(null);

  const [taxConfig, setTaxConfig] = useState<TaxConfigData>({
    taxType: 'Inclusive',
    taxPercentage: 5
  });

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodData[]>([
    { id: '1', name: 'Cash' }
  ]);

  const [users, setUsers] = useState<UserData[]>([
    { id: '1', email: 'cashier@example.com', name: 'Cashier', passwordPlaceholder: generateSecurePassword(), role: 'URY Cashier' }
  ]);

  useEffect(() => {
    async function loadCompanyDefault() {
      try {
        const res = await call<any>('ury.ury.api.minimal.business_setup.get_business_setup');
        const companyName = res?.message?.company || res?.company || res?.message?.data?.company || res?.data?.company;
        if (companyName) {
          setBranch(prev => ({
            ...prev,
            branchName: prev.branchName ? prev.branchName : companyName
          }));
          setRooms(prev => prev.map(r => (!r.branch || r.branch === 'Main Branch') ? { ...r, branch: companyName } : r));
          setTables(prev => prev.map(t => (!t.branch || t.branch === 'Main Branch') ? { ...t, branch: companyName } : t));
        }
      } catch (err) {
        console.error('Failed to load company name', err);
      }
    }
    loadCompanyDefault();
  }, []);

  const setActiveSection = useCallback((section: SectionId) => {
    setActiveSectionState(section);
    setVisitedSections(prev => new Set(prev).add(section));
  }, []);

  const markSectionCompleted = useCallback((section?: SectionId) => {
    const sec = section || activeSection;
    setCompletedSections(prev => new Set(prev).add(sec));
    setVisitedSections(prev => new Set(prev).add(sec));
  }, [activeSection]);

  const skipSection = useCallback((section?: SectionId) => {
    const sec = section || activeSection;
    const currentIndex = SECTION_ORDER.indexOf(sec);
    if (currentIndex >= 0 && currentIndex < SECTION_ORDER.length - 1) {
      const nextSec = SECTION_ORDER[currentIndex + 1];
      setActiveSection(nextSec);
    }
  }, [activeSection, setActiveSection]);

  const goToNextSection = useCallback(() => {
    markSectionCompleted(activeSection);
    const currentIndex = SECTION_ORDER.indexOf(activeSection);
    if (currentIndex < SECTION_ORDER.length - 1) {
      const nextSec = SECTION_ORDER[currentIndex + 1];
      setActiveSection(nextSec);
    }
  }, [activeSection, markSectionCompleted, setActiveSection]);

  const goToPrevSection = useCallback(() => {
    const currentIndex = SECTION_ORDER.indexOf(activeSection);
    if (currentIndex > 0) {
      const prevSec = SECTION_ORDER[currentIndex - 1];
      setActiveSection(prevSec);
    }
  }, [activeSection, setActiveSection]);

  const updateBranch = useCallback((data: Partial<BranchData>) => {
    setBranch(prev => {
      const updated = { ...prev, ...data };
      if (data.branchName && data.branchName !== prev.branchName) {
        const oldName = prev.branchName;
        const newName = data.branchName;
        setRooms(rPrev => rPrev.map(r => (!r.branch || r.branch === oldName || r.branch === 'Main Branch') ? { ...r, branch: newName } : r));
        setTables(tPrev => tPrev.map(t => (!t.branch || t.branch === oldName || t.branch === 'Main Branch') ? { ...t, branch: newName } : t));
      }
      return updated;
    });
  }, []);

  const addRoom = useCallback((room: Omit<RoomData, 'id'>) => {
    setRooms(prev => [...prev, { ...room, id: Date.now().toString() }]);
  }, []);

  const updateRoom = useCallback((id: string, room: Partial<RoomData>) => {
    setRooms(prev => prev.map(r => r.id === id ? { ...r, ...room } : r));
  }, []);

  const deleteRoom = useCallback((id: string) => {
    setRooms(prev => prev.filter(r => r.id !== id));
  }, []);

  const addTable = useCallback((table: Omit<TableData, 'id'>) => {
    setTables(prev => [...prev, { ...table, id: Date.now().toString() }]);
  }, []);

  const updateTable = useCallback((id: string, table: Partial<TableData>) => {
    setTables(prev => prev.map(t => t.id === id ? { ...t, ...table } : t));
  }, []);

  const deleteTable = useCallback((id: string) => {
    setTables(prev => prev.filter(t => t.id !== id));
  }, []);

  const addMenuItem = useCallback((item: Omit<MenuItemData, 'id'>) => {
    setMenuItems(prev => [...prev, { ...item, id: Date.now().toString() }]);
  }, []);

  const updateMenuItem = useCallback((id: string, item: Partial<MenuItemData>) => {
    setMenuItems(prev => prev.map(m => m.id === id ? { ...m, ...item } : m));
  }, []);

  const deleteMenuItem = useCallback((id: string) => {
    setMenuItems(prev => prev.filter(m => m.id !== id));
  }, []);

  const setMenuFile = useCallback((file: File | null) => {
    setMenuFileState(file);
  }, []);

  const updateTaxConfig = useCallback((config: Partial<TaxConfigData>) => {
    setTaxConfig(prev => ({ ...prev, ...config }));
  }, []);

  const addPaymentMethod = useCallback((method: Omit<PaymentMethodData, 'id'>) => {
    setPaymentMethods(prev => [...prev, { ...method, id: Date.now().toString() }]);
  }, []);

  const updatePaymentMethod = useCallback((id: string, method: Partial<PaymentMethodData>) => {
    setPaymentMethods(prev => prev.map(p => p.id === id ? { ...p, ...method } : p));
  }, []);

  const deletePaymentMethod = useCallback((id: string) => {
    setPaymentMethods(prev => prev.filter(p => p.id !== id));
  }, []);

  const addUser = useCallback((user: Omit<UserData, 'id'>) => {
    setUsers(prev => [...prev, { ...user, id: Date.now().toString() }]);
  }, []);

  const updateUser = useCallback((id: string, user: Partial<UserData>) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...user } : u));
  }, []);

  const deleteUser = useCallback((id: string) => {
    setUsers(prev => prev.filter(u => u.id !== id));
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
        skipSection,
        goToNextSection,
        goToPrevSection,
        updateBranch,
        addRoom,
        updateRoom,
        deleteRoom,
        addTable,
        updateTable,
        deleteTable,
        addMenuItem,
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
