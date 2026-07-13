import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMenuManagementStore } from '../store/menu-management-store';
import * as api from '../lib/menu-management-api';
import { showToast } from '../components/ui/toast';

// Mock the API functions
vi.mock('../lib/menu-management-api', () => ({
  getMenus: vi.fn().mockResolvedValue([
    { name: 'Test Menu', enabled: 1, branch: 'Main', price_list: 'Standard', items: [], item_count: 5, enabled_count: 4 },
  ]),
  getMenuDetail: vi.fn().mockResolvedValue({
    name: 'Test Menu', enabled: 1, branch: 'Main', price_list: 'Standard',
    items: [
      { name: 'item-1', item: 'ITEM001', item_name: 'Test Dish', rate: 15.50, special_dish: 0, disabled: 0, course: 'Starters', course_icon: null, idx: 1 },
      { name: 'item-2', item: 'ITEM002', item_name: 'Special Dish', rate: 25.00, special_dish: 1, disabled: 0, course: 'Main', course_icon: null, idx: 2 },
    ],
    item_count: 2,
    enabled_count: 2,
  }),
  addMenuItem: vi.fn().mockResolvedValue({ success: true, item: 'ITEM003', item_name: 'New Dish' }),
  updateMenuItem: vi.fn().mockResolvedValue({ success: true }),
  removeMenuItem: vi.fn().mockResolvedValue({ success: true }),
  batchUpdatePrices: vi.fn().mockResolvedValue({ success: true, updated_count: 2 }),
  getCoursesDetail: vi.fn().mockResolvedValue([
    { name: 'course-1', course: 'Starters', custom_serving_priority: 1, custom_indicate_in_kds: 0 },
    { name: 'course-2', course: 'Main Course', custom_serving_priority: 2, custom_indicate_in_kds: 1 },
  ]),
  createMenuCourse: vi.fn().mockResolvedValue('course-3'),
  updateMenuCourse: vi.fn().mockResolvedValue({ success: true }),
  deleteMenuCourse: vi.fn().mockResolvedValue({ success: true }),
  getAvailableItems: vi.fn().mockResolvedValue([
    { name: 'ITEM001', item_name: 'Test Dish', item_group: 'Food', standard_rate: 15.50, image: null },
  ]),
  toggleMenu: vi.fn().mockResolvedValue({ name: 'Test Menu', enabled: 0 }),
}));

// Mock toast
vi.mock('../components/ui/toast', () => ({
  showToast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// Helper to build a _server_messages error
function makeServerMessageError(msg: string) {
  const inner = JSON.stringify({ message: msg });
  const outer = JSON.stringify([inner]);
  return { _server_messages: outer };
}

describe('useMenuManagementStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state between tests
    useMenuManagementStore.setState({
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
    });
  });

  // ──────────────────────────────────────────────
  // Initial state
  // ──────────────────────────────────────────────
  it('should have correct initial state', () => {
    const state = useMenuManagementStore.getState();
    expect(state.menus).toEqual([]);
    expect(state.selectedMenu).toBeNull();
    expect(state.courses).toEqual([]);
    expect(state.availableItems).toEqual([]);
    expect(state.loading).toBe(false);
    expect(state.menuDetailLoading).toBe(false);
    expect(state.coursesLoading).toBe(false);
    expect(state.itemsLoading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.searchQuery).toBe('');
    expect(state.selectedCourseFilter).toBe('');
  });

  // ──────────────────────────────────────────────
  // fetchMenus
  // ──────────────────────────────────────────────
  it('should fetch menus successfully', async () => {
    await useMenuManagementStore.getState().fetchMenus();
    const state = useMenuManagementStore.getState();
    expect(state.menus).toHaveLength(1);
    expect(state.menus[0].name).toBe('Test Menu');
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('should set loading to true while fetching menus', async () => {
    let loadingDuringFetch = false;
    const promise = useMenuManagementStore.getState().fetchMenus();
    loadingDuringFetch = useMenuManagementStore.getState().loading;
    await promise;
    expect(loadingDuringFetch).toBe(true);
  });

  it('should handle fetchMenus error', async () => {
    vi.mocked(api.getMenus).mockRejectedValueOnce(new Error('Network error'));
    await useMenuManagementStore.getState().fetchMenus();
    const state = useMenuManagementStore.getState();
    expect(state.loading).toBe(false);
    expect(state.error).toBe('Failed to load menus');
    expect(showToast.error).toHaveBeenCalledWith('Failed to load menus');
  });

  // ──────────────────────────────────────────────
  // fetchMenuDetail
  // ──────────────────────────────────────────────
  it('should fetch menu detail successfully', async () => {
    await useMenuManagementStore.getState().fetchMenuDetail('Test Menu');
    const state = useMenuManagementStore.getState();
    expect(state.selectedMenu).not.toBeNull();
    expect(state.selectedMenu?.items).toHaveLength(2);
    expect(state.selectedMenu?.items[0].item_name).toBe('Test Dish');
    expect(state.menuDetailLoading).toBe(false);
  });

  it('should set menuDetailLoading while fetching detail', async () => {
    let loadingDuringFetch = false;
    const promise = useMenuManagementStore.getState().fetchMenuDetail('Test Menu');
    loadingDuringFetch = useMenuManagementStore.getState().menuDetailLoading;
    await promise;
    expect(loadingDuringFetch).toBe(true);
  });

  it('should handle fetchMenuDetail error', async () => {
    vi.mocked(api.getMenuDetail).mockRejectedValueOnce(new Error('Not found'));
    await useMenuManagementStore.getState().fetchMenuDetail('Bad Menu');
    const state = useMenuManagementStore.getState();
    expect(state.menuDetailLoading).toBe(false);
    expect(state.error).toBe('Failed to load menu details');
    expect(showToast.error).toHaveBeenCalledWith('Failed to load menu details');
  });

  // ──────────────────────────────────────────────
  // fetchCourses
  // ──────────────────────────────────────────────
  it('should fetch courses successfully', async () => {
    await useMenuManagementStore.getState().fetchCourses();
    const state = useMenuManagementStore.getState();
    expect(state.courses).toHaveLength(2);
    expect(state.courses[0].course).toBe('Starters');
    expect(state.coursesLoading).toBe(false);
  });

  it('should set coursesLoading while fetching courses', async () => {
    let loadingDuringFetch = false;
    const promise = useMenuManagementStore.getState().fetchCourses();
    loadingDuringFetch = useMenuManagementStore.getState().coursesLoading;
    await promise;
    expect(loadingDuringFetch).toBe(true);
  });

  it('should handle fetchCourses error', async () => {
    vi.mocked(api.getCoursesDetail).mockRejectedValueOnce(new Error('Server error'));
    await useMenuManagementStore.getState().fetchCourses();
    const state = useMenuManagementStore.getState();
    expect(state.coursesLoading).toBe(false);
    expect(showToast.error).toHaveBeenCalledWith('Failed to load courses');
  });

  // ──────────────────────────────────────────────
  // fetchAvailableItems
  // ──────────────────────────────────────────────
  it('should fetch available items successfully', async () => {
    await useMenuManagementStore.getState().fetchAvailableItems();
    const state = useMenuManagementStore.getState();
    expect(state.availableItems).toHaveLength(1);
    expect(state.availableItems[0].item_name).toBe('Test Dish');
    expect(state.itemsLoading).toBe(false);
  });

  it('should set itemsLoading while fetching available items', async () => {
    let loadingDuringFetch = false;
    const promise = useMenuManagementStore.getState().fetchAvailableItems();
    loadingDuringFetch = useMenuManagementStore.getState().itemsLoading;
    await promise;
    expect(loadingDuringFetch).toBe(true);
  });

  it('should handle fetchAvailableItems error', async () => {
    vi.mocked(api.getAvailableItems).mockRejectedValueOnce(new Error('Server error'));
    await useMenuManagementStore.getState().fetchAvailableItems();
    const state = useMenuManagementStore.getState();
    expect(state.itemsLoading).toBe(false);
    expect(showToast.error).toHaveBeenCalledWith('Failed to load available items');
  });

  // ──────────────────────────────────────────────
  // toggleMenuStatus
  // ──────────────────────────────────────────────
  it('should enable a menu and show success toast', async () => {
    await useMenuManagementStore.getState().toggleMenuStatus('Test Menu', 1);
    expect(api.toggleMenu).toHaveBeenCalledWith('Test Menu', 1);
    expect(api.getMenus).toHaveBeenCalled();
    expect(showToast.success).toHaveBeenCalledWith('Menu enabled');
  });

  it('should disable a menu and show disabled toast', async () => {
    await useMenuManagementStore.getState().toggleMenuStatus('Test Menu', 0);
    expect(api.toggleMenu).toHaveBeenCalledWith('Test Menu', 0);
    expect(showToast.success).toHaveBeenCalledWith('Menu disabled');
  });

  it('should handle toggleMenuStatus error', async () => {
    vi.mocked(api.toggleMenu).mockRejectedValueOnce(new Error('Forbidden'));
    await useMenuManagementStore.getState().toggleMenuStatus('Test Menu', 1);
    expect(showToast.error).toHaveBeenCalledWith('Failed to toggle menu status');
  });

  it('should refresh menus list after toggling', async () => {
    const updatedMenus = [{ name: 'Test Menu', enabled: 0, branch: 'Main', price_list: 'Standard', items: [], item_count: 5, enabled_count: 4 }];
    vi.mocked(api.getMenus).mockResolvedValueOnce(updatedMenus);
    await useMenuManagementStore.getState().toggleMenuStatus('Test Menu', 0);
    expect(useMenuManagementStore.getState().menus).toEqual(updatedMenus);
  });

  // ──────────────────────────────────────────────
  // addItemToMenu
  // ──────────────────────────────────────────────
  it('should add item to menu with all parameters', async () => {
    await useMenuManagementStore.getState().addItemToMenu('Test Menu', 'ITEM003', 18.00, 'course-1', 0);
    expect(api.addMenuItem).toHaveBeenCalledWith('Test Menu', 'ITEM003', 18.00, 'course-1', 0);
    expect(api.getMenuDetail).toHaveBeenCalledWith('Test Menu');
    expect(showToast.success).toHaveBeenCalledWith('Item added to menu');
  });

  it('should add item to menu without optional parameters', async () => {
    await useMenuManagementStore.getState().addItemToMenu('Test Menu', 'ITEM003', 18.00);
    expect(api.addMenuItem).toHaveBeenCalledWith('Test Menu', 'ITEM003', 18.00, undefined, undefined);
  });

  it('should handle addItemToMenu error with _server_messages', async () => {
    const serverErr = makeServerMessageError('Duplicate item exists');
    vi.mocked(api.addMenuItem).mockRejectedValueOnce(serverErr);
    await useMenuManagementStore.getState().addItemToMenu('Test Menu', 'ITEM003', 18.00);
    expect(showToast.error).toHaveBeenCalledWith('Duplicate item exists');
  });

  it('should handle addItemToMenu error without _server_messages', async () => {
    vi.mocked(api.addMenuItem).mockRejectedValueOnce(new Error('Unknown error'));
    await useMenuManagementStore.getState().addItemToMenu('Test Menu', 'ITEM003', 18.00);
    expect(showToast.error).toHaveBeenCalledWith('Failed to add item');
  });

  // ──────────────────────────────────────────────
  // updateItemInMenu
  // ──────────────────────────────────────────────
  it('should update item in menu successfully', async () => {
    await useMenuManagementStore.getState().updateItemInMenu('Test Menu', 'item-1', {
      rate: 20.00,
      disabled: 1,
    });
    expect(api.updateMenuItem).toHaveBeenCalledWith('Test Menu', 'item-1', { rate: 20.00, disabled: 1 });
    expect(api.getMenuDetail).toHaveBeenCalledWith('Test Menu');
    expect(showToast.success).toHaveBeenCalledWith('Item updated');
  });

  it('should update item with course change', async () => {
    await useMenuManagementStore.getState().updateItemInMenu('Test Menu', 'item-1', {
      course: 'Desserts',
    });
    expect(api.updateMenuItem).toHaveBeenCalledWith('Test Menu', 'item-1', { course: 'Desserts' });
  });

  it('should handle updateItemInMenu error', async () => {
    vi.mocked(api.updateMenuItem).mockRejectedValueOnce(new Error('Not found'));
    await useMenuManagementStore.getState().updateItemInMenu('Test Menu', 'item-1', { rate: 20.00 });
    expect(showToast.error).toHaveBeenCalledWith('Failed to update item');
  });

  // ──────────────────────────────────────────────
  // removeItemFromMenu
  // ──────────────────────────────────────────────
  it('should remove item from menu successfully', async () => {
    await useMenuManagementStore.getState().removeItemFromMenu('Test Menu', 'item-1');
    expect(api.removeMenuItem).toHaveBeenCalledWith('Test Menu', 'item-1');
    expect(api.getMenuDetail).toHaveBeenCalledWith('Test Menu');
    expect(showToast.success).toHaveBeenCalledWith('Item removed from menu');
  });

  it('should handle removeItemFromMenu error', async () => {
    vi.mocked(api.removeMenuItem).mockRejectedValueOnce(new Error('Not found'));
    await useMenuManagementStore.getState().removeItemFromMenu('Test Menu', 'item-1');
    expect(showToast.error).toHaveBeenCalledWith('Failed to remove item');
  });

  // ──────────────────────────────────────────────
  // batchUpdateItemPrices
  // ──────────────────────────────────────────────
  it('should batch update item prices successfully', async () => {
    const updates = [
      { item_row_name: 'item-1', rate: 17.00 },
      { item_row_name: 'item-2', rate: 28.00 },
    ];
    await useMenuManagementStore.getState().batchUpdateItemPrices('Test Menu', updates);
    expect(api.batchUpdatePrices).toHaveBeenCalledWith('Test Menu', updates);
    expect(api.getMenuDetail).toHaveBeenCalledWith('Test Menu');
    expect(showToast.success).toHaveBeenCalledWith('2 prices updated');
  });

  it('should handle batchUpdateItemPrices error', async () => {
    vi.mocked(api.batchUpdatePrices).mockRejectedValueOnce(new Error('Batch failed'));
    await useMenuManagementStore.getState().batchUpdateItemPrices('Test Menu', [
      { item_row_name: 'item-1', rate: 17.00 },
    ]);
    expect(showToast.error).toHaveBeenCalledWith('Failed to update prices');
  });

  it('should show correct count in batch price update toast', async () => {
    const updates = [
      { item_row_name: 'item-1', rate: 17.00 },
      { item_row_name: 'item-2', rate: 28.00 },
      { item_row_name: 'item-3', rate: 35.00 },
    ];
    await useMenuManagementStore.getState().batchUpdateItemPrices('Test Menu', updates);
    expect(showToast.success).toHaveBeenCalledWith('3 prices updated');
  });

  // ──────────────────────────────────────────────
  // addCourse
  // ──────────────────────────────────────────────
  it('should add a course with all parameters', async () => {
    await useMenuManagementStore.getState().addCourse('Desserts', 3, 0);
    expect(api.createMenuCourse).toHaveBeenCalledWith('Desserts', 3, 0);
    expect(api.getCoursesDetail).toHaveBeenCalled();
    expect(showToast.success).toHaveBeenCalledWith('Course created');
  });

  it('should add a course without optional parameters', async () => {
    await useMenuManagementStore.getState().addCourse('Desserts');
    expect(api.createMenuCourse).toHaveBeenCalledWith('Desserts', undefined, undefined);
  });

  it('should handle addCourse error with _server_messages', async () => {
    const serverErr = makeServerMessageError('Course already exists');
    vi.mocked(api.createMenuCourse).mockRejectedValueOnce(serverErr);
    await useMenuManagementStore.getState().addCourse('Starters', 1, 0);
    expect(showToast.error).toHaveBeenCalledWith('Course already exists');
  });

  it('should handle addCourse error without _server_messages', async () => {
    vi.mocked(api.createMenuCourse).mockRejectedValueOnce(new Error('Unknown'));
    await useMenuManagementStore.getState().addCourse('Desserts');
    expect(showToast.error).toHaveBeenCalledWith('Failed to create course');
  });

  // ──────────────────────────────────────────────
  // updateCourseItem
  // ──────────────────────────────────────────────
  it('should update course item successfully', async () => {
    await useMenuManagementStore.getState().updateCourseItem('Starters', {
      serving_priority: 5,
      indicate_in_kds: 1,
    });
    expect(api.updateMenuCourse).toHaveBeenCalledWith('Starters', { serving_priority: 5, indicate_in_kds: 1 });
    expect(api.getCoursesDetail).toHaveBeenCalled();
    expect(showToast.success).toHaveBeenCalledWith('Course updated');
  });

  it('should update course name', async () => {
    await useMenuManagementStore.getState().updateCourseItem('Starters', {
      course: 'Appetizers',
    });
    expect(api.updateMenuCourse).toHaveBeenCalledWith('Starters', { course: 'Appetizers' });
  });

  it('should handle updateCourseItem error', async () => {
    vi.mocked(api.updateMenuCourse).mockRejectedValueOnce(new Error('Not found'));
    await useMenuManagementStore.getState().updateCourseItem('Starters', { serving_priority: 5 });
    expect(showToast.error).toHaveBeenCalledWith('Failed to update course');
  });

  // ──────────────────────────────────────────────
  // deleteCourse
  // ──────────────────────────────────────────────
  it('should delete a course successfully', async () => {
    await useMenuManagementStore.getState().deleteCourse('course-1');
    expect(api.deleteMenuCourse).toHaveBeenCalledWith('course-1');
    expect(api.getCoursesDetail).toHaveBeenCalled();
    expect(showToast.success).toHaveBeenCalledWith('Course deleted');
  });

  it('should handle deleteCourse error with _server_messages', async () => {
    const serverErr = makeServerMessageError('Course in use');
    vi.mocked(api.deleteMenuCourse).mockRejectedValueOnce(serverErr);
    await useMenuManagementStore.getState().deleteCourse('course-1');
    expect(showToast.error).toHaveBeenCalledWith('Course in use');
  });

  it('should handle deleteCourse error without _server_messages', async () => {
    vi.mocked(api.deleteMenuCourse).mockRejectedValueOnce(new Error('Unknown'));
    await useMenuManagementStore.getState().deleteCourse('course-1');
    expect(showToast.error).toHaveBeenCalledWith('Failed to delete course');
  });

  // ──────────────────────────────────────────────
  // setSearchQuery / setSelectedCourseFilter / clearSelectedMenu
  // ──────────────────────────────────────────────
  it('should set search query', () => {
    useMenuManagementStore.getState().setSearchQuery('pizza');
    expect(useMenuManagementStore.getState().searchQuery).toBe('pizza');
  });

  it('should clear search query', () => {
    useMenuManagementStore.getState().setSearchQuery('pizza');
    useMenuManagementStore.getState().setSearchQuery('');
    expect(useMenuManagementStore.getState().searchQuery).toBe('');
  });

  it('should set course filter', () => {
    useMenuManagementStore.getState().setSelectedCourseFilter('Starters');
    expect(useMenuManagementStore.getState().selectedCourseFilter).toBe('Starters');
  });

  it('should clear course filter', () => {
    useMenuManagementStore.getState().setSelectedCourseFilter('Starters');
    useMenuManagementStore.getState().setSelectedCourseFilter('');
    expect(useMenuManagementStore.getState().selectedCourseFilter).toBe('');
  });

  it('should clear selected menu', async () => {
    await useMenuManagementStore.getState().fetchMenuDetail('Test Menu');
    expect(useMenuManagementStore.getState().selectedMenu).not.toBeNull();

    useMenuManagementStore.getState().clearSelectedMenu();
    expect(useMenuManagementStore.getState().selectedMenu).toBeNull();
  });

  // ──────────────────────────────────────────────
  // Loading state transitions
  // ──────────────────────────────────────────────
  it('should clear error on fetchMenus start', async () => {
    // First, set an error state
    vi.mocked(api.getMenus).mockRejectedValueOnce(new Error('fail'));
    await useMenuManagementStore.getState().fetchMenus();
    expect(useMenuManagementStore.getState().error).toBe('Failed to load menus');

    // Now fetch again successfully - error should be cleared
    vi.mocked(api.getMenus).mockResolvedValueOnce([{ name: 'New Menu', enabled: 1 }]);
    await useMenuManagementStore.getState().fetchMenus();
    expect(useMenuManagementStore.getState().error).toBeNull();
  });

  it('should clear error on fetchMenuDetail start', async () => {
    // Set error first
    vi.mocked(api.getMenus).mockRejectedValueOnce(new Error('fail'));
    await useMenuManagementStore.getState().fetchMenus();
    expect(useMenuManagementStore.getState().error).not.toBeNull();

    // fetchMenuDetail should clear error
    const promise = useMenuManagementStore.getState().fetchMenuDetail('Test Menu');
    // error should be cleared at the start
    expect(useMenuManagementStore.getState().error).toBeNull();
    await promise;
  });
});
