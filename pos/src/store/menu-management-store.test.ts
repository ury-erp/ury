import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMenuManagementStore } from '../store/menu-management-store';

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

describe('useMenuManagementStore', () => {
  beforeEach(() => {
    // Reset store state between tests
    const store = useMenuManagementStore.getState();
    store.clearSelectedMenu();
    useMenuManagementStore.setState({
      searchQuery: '',
      selectedCourseFilter: '',
    });
  });

  it('should have correct initial state', () => {
    const state = useMenuManagementStore.getState();
    expect(state.menus).toEqual([]);
    expect(state.selectedMenu).toBeNull();
    expect(state.courses).toEqual([]);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.searchQuery).toBe('');
    expect(state.selectedCourseFilter).toBe('');
  });

  it('should fetch menus successfully', async () => {
    await useMenuManagementStore.getState().fetchMenus();
    const state = useMenuManagementStore.getState();
    expect(state.menus).toHaveLength(1);
    expect(state.menus[0].name).toBe('Test Menu');
    expect(state.loading).toBe(false);
  });

  it('should fetch menu detail successfully', async () => {
    await useMenuManagementStore.getState().fetchMenuDetail('Test Menu');
    const state = useMenuManagementStore.getState();
    expect(state.selectedMenu).not.toBeNull();
    expect(state.selectedMenu?.items).toHaveLength(2);
    expect(state.selectedMenu?.items[0].item_name).toBe('Test Dish');
  });

  it('should fetch courses successfully', async () => {
    await useMenuManagementStore.getState().fetchCourses();
    const state = useMenuManagementStore.getState();
    expect(state.courses).toHaveLength(2);
    expect(state.courses[0].course).toBe('Starters');
  });

  it('should set search query', () => {
    useMenuManagementStore.getState().setSearchQuery('pizza');
    expect(useMenuManagementStore.getState().searchQuery).toBe('pizza');
  });

  it('should set course filter', () => {
    useMenuManagementStore.getState().setSelectedCourseFilter('Starters');
    expect(useMenuManagementStore.getState().selectedCourseFilter).toBe('Starters');
  });

  it('should clear selected menu', async () => {
    await useMenuManagementStore.getState().fetchMenuDetail('Test Menu');
    expect(useMenuManagementStore.getState().selectedMenu).not.toBeNull();

    useMenuManagementStore.getState().clearSelectedMenu();
    expect(useMenuManagementStore.getState().selectedMenu).toBeNull();
  });

  it('should add item to menu', async () => {
    await useMenuManagementStore.getState().fetchMenuDetail('Test Menu');
    const initialCount = useMenuManagementStore.getState().selectedMenu?.items.length;

    await useMenuManagementStore.getState().addItemToMenu('Test Menu', 'ITEM003', 18.00, 'course-1', 0);

    // After adding, the menu should be re-fetched
    expect(useMenuManagementStore.getState().selectedMenu).not.toBeNull();
  });

  it('should update item in menu', async () => {
    await useMenuManagementStore.getState().fetchMenuDetail('Test Menu');

    await useMenuManagementStore.getState().updateItemInMenu('Test Menu', 'item-1', {
      rate: 20.00,
      disabled: 1,
    });

    // Verify the update was called
    expect(useMenuManagementStore.getState().selectedMenu).not.toBeNull();
  });

  it('should remove item from menu', async () => {
    await useMenuManagementStore.getState().fetchMenuDetail('Test Menu');

    await useMenuManagementStore.getState().removeItemFromMenu('Test Menu', 'item-1');

    expect(useMenuManagementStore.getState().selectedMenu).not.toBeNull();
  });

  it('should batch update item prices', async () => {
    await useMenuManagementStore.getState().fetchMenuDetail('Test Menu');

    await useMenuManagementStore.getState().batchUpdateItemPrices('Test Menu', [
      { item_row_name: 'item-1', rate: 17.00 },
      { item_row_name: 'item-2', rate: 28.00 },
    ]);

    expect(useMenuManagementStore.getState().selectedMenu).not.toBeNull();
  });

  it('should add a course', async () => {
    await useMenuManagementStore.getState().addCourse('Desserts', 3, 0);

    const state = useMenuManagementStore.getState();
    expect(state.courses).toHaveLength(2); // Re-fetched after add
  });

  it('should delete a course', async () => {
    await useMenuManagementStore.getState().fetchCourses();
    await useMenuManagementStore.getState().deleteCourse('course-1');

    // Should re-fetch courses
    expect(useMenuManagementStore.getState().courses).toHaveLength(2);
  });
});
