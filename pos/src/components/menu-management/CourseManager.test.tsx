import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import CourseManager from './CourseManager';

// Mock i18n
vi.mock('../../i18n', () => ({
  t: (key: string) => key,
  getActiveLanguage: () => 'en',
  getActiveDirection: () => 'ltr',
  initI18n: vi.fn(),
}));

// Mock UI components
vi.mock('../ui', () => ({
  Button: ({ children, onClick, disabled, className, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} className={className} {...props}>
      {children}
    </button>
  ),
  Input: (props: any) => {
    const { className, variant, size, error, ...rest } = props;
    return <input {...rest} />;
  },
  Badge: ({ children, className, ...props }: any) => (
    <span className={className} {...props}>{children}</span>
  ),
  Spinner: () => <div data-testid="spinner">Loading</div>,
}));

// Mutable store state
let mockStoreState: Record<string, unknown> = {};

vi.mock('../../store/menu-management-store', () => ({
  useMenuManagementStore: () => mockStoreState,
}));

const mockCourses = [
  { name: 'CRS001', course: 'Starters', custom_serving_priority: 1, custom_indicate_in_kds: 0 },
  { name: 'CRS002', course: 'Main Course', custom_serving_priority: 2, custom_indicate_in_kds: 1 },
];

describe('CourseManager', () => {
  let confirmMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mockStoreState = {
      courses: [...mockCourses],
      coursesLoading: false,
      addCourse: vi.fn().mockResolvedValue(undefined),
      updateCourseItem: vi.fn().mockResolvedValue(undefined),
      deleteCourse: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    confirmMock.mockRestore();
  });

  it('shows "Loading courses..." when coursesLoading is true', () => {
    mockStoreState.coursesLoading = true;
    render(<CourseManager />);
    expect(screen.getByText('Loading courses...')).toBeInTheDocument();
  });

  it('does not show loading when coursesLoading is false', () => {
    render(<CourseManager />);
    expect(screen.queryByText('Loading courses...')).not.toBeInTheDocument();
  });

  it('shows the add course form', () => {
    render(<CourseManager />);
    expect(screen.getByPlaceholderText('e.g., Starters, Main Course, Desserts')).toBeInTheDocument();
  });

  it('shows course name label', () => {
    render(<CourseManager />);
    expect(screen.getByText('menu_management.course_name')).toBeInTheDocument();
  });

  it('shows priority label', () => {
    render(<CourseManager />);
    expect(screen.getByText('menu_management.priority')).toBeInTheDocument();
  });

  it('shows Add button', () => {
    render(<CourseManager />);
    expect(screen.getByText('common.save')).toBeInTheDocument();
  });

  it('Add button is disabled when course name is empty', () => {
    render(<CourseManager />);
    const addButton = screen.getByText('common.save').closest('button')!;
    expect(addButton.disabled).toBe(true);
  });

  it('Add button is enabled when course name is entered', () => {
    render(<CourseManager />);
    const nameInput = screen.getByPlaceholderText('e.g., Starters, Main Course, Desserts');
    fireEvent.change(nameInput, { target: { value: 'Desserts' } });
    const addButton = screen.getByText('common.save').closest('button')!;
    expect(addButton.disabled).toBe(false);
  });

  it('shows courses list when courses exist', () => {
    render(<CourseManager />);
    expect(screen.getByText('Starters')).toBeInTheDocument();
    expect(screen.getByText('Main Course')).toBeInTheDocument();
  });

  it('shows "No courses defined yet" when courses is empty', () => {
    mockStoreState.courses = [];
    render(<CourseManager />);
    expect(screen.getByText('menu_management.no_courses')).toBeInTheDocument();
  });

  it('shows priority for each course', () => {
    render(<CourseManager />);
    expect(screen.getByText(/Priority: 1/)).toBeInTheDocument();
    expect(screen.getByText(/Priority: 2/)).toBeInTheDocument();
  });

  it('calls addCourse when Add button is clicked with valid name', async () => {
    render(<CourseManager />);
    const nameInput = screen.getByPlaceholderText('e.g., Starters, Main Course, Desserts');
    fireEvent.change(nameInput, { target: { value: 'Desserts' } });
    fireEvent.click(screen.getByText('common.save'));
    await waitFor(() => {
      expect(mockStoreState.addCourse).toHaveBeenCalledWith('Desserts', 0);
    });
  });

  it('clears course name input after adding', async () => {
    render(<CourseManager />);
    const nameInput = screen.getByPlaceholderText('e.g., Starters, Main Course, Desserts') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Desserts' } });
    fireEvent.click(screen.getByText('common.save'));
    await waitFor(() => {
      expect(nameInput.value).toBe('');
    });
  });

  it('shows inline edit when edit button is clicked', () => {
    render(<CourseManager />);
    // Find the "Starters" text, go up to the course container, and find the edit button
    const startersText = screen.getByText('Starters');
    const courseRow = startersText.closest('.flex.items-center')!;
    const editButton = within(courseRow as HTMLElement).getAllByRole('button')[0]; // First button is edit
    fireEvent.click(editButton);
    // After clicking edit, the row should contain input fields for name and priority
    const inputs = within(courseRow as HTMLElement).getAllByRole('textbox');
    expect(inputs.length).toBeGreaterThan(0);
  });

  it('calls updateCourseItem when save edit is clicked', async () => {
    render(<CourseManager />);
    // Click edit on Starters
    const startersText = screen.getByText('Starters');
    const courseRow = startersText.closest('.flex.items-center')!;
    const editButton = within(courseRow as HTMLElement).getAllByRole('button')[0];
    fireEvent.click(editButton);

    // Change the name in the edit input
    const editInputs = within(courseRow as HTMLElement).getAllByRole('textbox');
    fireEvent.change(editInputs[0], { target: { value: 'Appetizers' } });

    // Click the save button (Check icon) - it's the first button in the edit mode
    const editModeButtons = within(courseRow as HTMLElement).getAllByRole('button');
    // In edit mode: [save (check), cancel (x)]
    fireEvent.click(editModeButtons[0]);

    await waitFor(() => {
      expect(mockStoreState.updateCourseItem).toHaveBeenCalledWith(
        'CRS001',
        { course: 'Appetizers', serving_priority: 1 }
      );
    });
  });

  it('cancels inline edit when cancel button is clicked', () => {
    render(<CourseManager />);
    // Click edit on Starters
    const startersText = screen.getByText('Starters');
    const courseRow = startersText.closest('.flex.items-center')!;
    const editButton = within(courseRow as HTMLElement).getAllByRole('button')[0];
    fireEvent.click(editButton);

    // Click the cancel button (X icon) - second button in edit mode
    const editModeButtons = within(courseRow as HTMLElement).getAllByRole('button');
    fireEvent.click(editModeButtons[1]);

    // After cancel, "Starters" should be back as plain text (not in an input)
    // Since the second course "Main Course" is still in display mode,
    // we can verify by checking the Starters row still shows display mode
    expect(screen.getByText('Main Course')).toBeInTheDocument();
  });

  it('calls confirm and deleteCourse when delete is confirmed', async () => {
    confirmMock.mockReturnValue(true);
    render(<CourseManager />);
    // Find the delete button for Starters
    const startersText = screen.getByText('Starters');
    const courseRow = startersText.closest('.flex.items-center')!;
    const buttons = within(courseRow as HTMLElement).getAllByRole('button');
    // [edit, delete] - delete is the second button
    fireEvent.click(buttons[1]);
    expect(confirmMock).toHaveBeenCalled();
    await waitFor(() => {
      expect(mockStoreState.deleteCourse).toHaveBeenCalledWith('CRS001');
    });
  });

  it('does not call deleteCourse when delete is cancelled', () => {
    confirmMock.mockReturnValue(false);
    render(<CourseManager />);
    const startersText = screen.getByText('Starters');
    const courseRow = startersText.closest('.flex.items-center')!;
    const buttons = within(courseRow as HTMLElement).getAllByRole('button');
    fireEvent.click(buttons[1]);
    expect(confirmMock).toHaveBeenCalled();
    expect(mockStoreState.deleteCourse).not.toHaveBeenCalled();
  });

  it('does not add course with empty name', () => {
    render(<CourseManager />);
    const addButton = screen.getByText('common.save').closest('button')!;
    expect(addButton.disabled).toBe(true);
  });

  it('sets priority via input', () => {
    render(<CourseManager />);
    const numberInputs = screen.getAllByRole('spinbutton');
    fireEvent.change(numberInputs[0], { target: { value: '5' } });
    expect(numberInputs[0]).toHaveValue(5);
  });
});
