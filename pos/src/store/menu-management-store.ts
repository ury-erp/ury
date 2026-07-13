import { create } from 'zustand';
import {
  getMenus,
  getMenuDetail,
  addMenuItem,
  updateMenuItem,
  removeMenuItem,
  batchUpdatePrices,
  getCoursesDetail,
  createMenuCourse,
  updateMenuCourse,
  deleteMenuCourse,
  getAvailableItems,
  toggleMenu,
  URYMenu,
  URYMenuCourse,
  AvailableItem,
} from '../lib/menu-management-api';
import { showToast } from '../components/ui/toast';

interface MenuManagementState {
  menus: URYMenu[];
  selectedMenu: URYMenu | null;
  courses: URYMenuCourse[];
  availableItems: AvailableItem[];
  loading: boolean;
  menuDetailLoading: boolean;
  coursesLoading: boolean;
  itemsLoading: boolean;
  error: string | null;
  searchQuery: string;
  selectedCourseFilter: string;
}

interface MenuManagementActions {
  fetchMenus: () => Promise<void>;
  fetchMenuDetail: (menuName: string) => Promise<void>;
  fetchCourses: () => Promise<void>;
  fetchAvailableItems: () => Promise<void>;
  toggleMenuStatus: (menuName: string, enabled: number) => Promise<void>;
  addItemToMenu: (
    menuName: string,
    item: string,
    rate: number,
    course?: string | null,
    specialDish?: number
  ) => Promise<void>;
  updateItemInMenu: (
    menuName: string,
    itemRowName: string,
    updates: {
      rate?: number;
      special_dish?: number;
      disabled?: number;
      course?: string;
    }
  ) => Promise<void>;
  removeItemFromMenu: (menuName: string, itemRowName: string) => Promise<void>;
  batchUpdateItemPrices: (
    menuName: string,
    updates: Array<{ item_row_name: string; rate: number }>
  ) => Promise<void>;
  addCourse: (
    course: string,
    servingPriority?: number,
    indicateInKds?: number
  ) => Promise<void>;
  updateCourseItem: (
    courseName: string,
    updates: {
      course?: string;
      serving_priority?: number;
      indicate_in_kds?: number;
    }
  ) => Promise<void>;
  deleteCourse: (courseName: string) => Promise<void>;
  setSearchQuery: (query: string) => void;
  setSelectedCourseFilter: (course: string) => void;
  clearSelectedMenu: () => void;
}

export const useMenuManagementStore = create<
  MenuManagementState & MenuManagementActions
>((set, get) => ({
  menus: [],
  selectedMenu: null,
  courses: [],
  availableItems: [],
  loading: false,
  menuDetailLoading: false,
  coursesLoading: false,
  itemsLoading: false,
  error: null,
  searchQuery: '',
  selectedCourseFilter: '',

  fetchMenus: async () => {
    try {
      set({ loading: true, error: null });
      const menus = await getMenus();
      set({ menus, loading: false });
    } catch {
      set({ error: 'Failed to load menus', loading: false });
      showToast.error('Failed to load menus');
    }
  },

  fetchMenuDetail: async (menuName: string) => {
    try {
      set({ menuDetailLoading: true, error: null });
      const menu = await getMenuDetail(menuName);
      set({ selectedMenu: menu, menuDetailLoading: false });
    } catch {
      set({ error: 'Failed to load menu details', menuDetailLoading: false });
      showToast.error('Failed to load menu details');
    }
  },

  fetchCourses: async () => {
    try {
      set({ coursesLoading: true });
      const courses = await getCoursesDetail();
      set({ courses, coursesLoading: false });
    } catch {
      set({ coursesLoading: false });
      showToast.error('Failed to load courses');
    }
  },

  fetchAvailableItems: async () => {
    try {
      set({ itemsLoading: true });
      const items = await getAvailableItems();
      set({ availableItems: items, itemsLoading: false });
    } catch {
      set({ itemsLoading: false });
      showToast.error('Failed to load available items');
    }
  },

  toggleMenuStatus: async (menuName: string, enabled: number) => {
    try {
      await toggleMenu(menuName, enabled);
      const menus = await getMenus();
      set({ menus });
      showToast.success(enabled ? 'Menu enabled' : 'Menu disabled');
    } catch {
      showToast.error('Failed to toggle menu status');
    }
  },

  addItemToMenu: async (menuName, item, rate, course, specialDish) => {
    try {
      await addMenuItem(menuName, item, rate, course, specialDish);
      await get().fetchMenuDetail(menuName);
      showToast.success('Item added to menu');
    } catch (error: unknown) {
      const err = error as { _server_messages?: string };
      const msg = err?._server_messages
        ? JSON.parse(JSON.parse(err._server_messages)[0]).message
        : 'Failed to add item';
      showToast.error(msg);
    }
  },

  updateItemInMenu: async (menuName, itemRowName, updates) => {
    try {
      await updateMenuItem(menuName, itemRowName, updates);
      await get().fetchMenuDetail(menuName);
      showToast.success('Item updated');
    } catch {
      showToast.error('Failed to update item');
    }
  },

  removeItemFromMenu: async (menuName, itemRowName) => {
    try {
      await removeMenuItem(menuName, itemRowName);
      await get().fetchMenuDetail(menuName);
      showToast.success('Item removed from menu');
    } catch {
      showToast.error('Failed to remove item');
    }
  },

  batchUpdateItemPrices: async (menuName, updates) => {
    try {
      await batchUpdatePrices(menuName, updates);
      await get().fetchMenuDetail(menuName);
      showToast.success(`${updates.length} prices updated`);
    } catch {
      showToast.error('Failed to update prices');
    }
  },

  addCourse: async (course, servingPriority, indicateInKds) => {
    try {
      await createMenuCourse(course, servingPriority, indicateInKds);
      await get().fetchCourses();
      showToast.success('Course created');
    } catch (error: unknown) {
      const err = error as { _server_messages?: string };
      const msg = err?._server_messages
        ? JSON.parse(JSON.parse(err._server_messages)[0]).message
        : 'Failed to create course';
      showToast.error(msg);
    }
  },

  updateCourseItem: async (courseName, updates) => {
    try {
      await updateMenuCourse(courseName, updates);
      await get().fetchCourses();
      showToast.success('Course updated');
    } catch {
      showToast.error('Failed to update course');
    }
  },

  deleteCourse: async (courseName) => {
    try {
      await deleteMenuCourse(courseName);
      await get().fetchCourses();
      showToast.success('Course deleted');
    } catch (error: unknown) {
      const err = error as { _server_messages?: string };
      const msg = err?._server_messages
        ? JSON.parse(JSON.parse(err._server_messages)[0]).message
        : 'Failed to delete course';
      showToast.error(msg);
    }
  },

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedCourseFilter: (course) => set({ selectedCourseFilter: course }),
  clearSelectedMenu: () => set({ selectedMenu: null }),
}));
