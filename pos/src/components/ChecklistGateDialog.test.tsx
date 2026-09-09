import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChecklistGateDialog from './ChecklistGateDialog';

vi.mock('../lib/checklist-api', () => ({
  getChecklist: vi.fn(),
  submitChecklist: vi.fn(),
}));

vi.mock('../i18n', () => ({
  t: (key: string) => key,
}));

import { getChecklist, submitChecklist } from '../lib/checklist-api';

const mockGetChecklist = getChecklist as ReturnType<typeof vi.fn>;
const mockSubmitChecklist = submitChecklist as ReturnType<typeof vi.fn>;

describe('ChecklistGateDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays loading state initially', () => {
    mockGetChecklist.mockImplementation(() => new Promise(() => {}));
    
    render(
      <ChecklistGateDialog
        posProfile="POS-001"
        checklistType="Opening"
        onComplete={vi.fn()}
      />
    );
    
    expect(screen.getByText('checklist.loading')).toBeTruthy();
  });

  it('calls onComplete when checklist is already complete', async () => {
    const onComplete = vi.fn();
    mockGetChecklist.mockResolvedValueOnce({
      items: [],
      logName: 'LOG-001',
      logStatus: 'Complete',
    });
    
    render(
      <ChecklistGateDialog
        posProfile="POS-001"
        checklistType="Opening"
        onComplete={onComplete}
      />
    );
    
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
  });

  it('renders opening checklist title', async () => {
    mockGetChecklist.mockResolvedValueOnce({
      items: [],
      logName: 'LOG-001',
      logStatus: 'Incomplete',
    });
    mockSubmitChecklist.mockResolvedValueOnce({ status: 'Complete' });
    
    render(
      <ChecklistGateDialog
        posProfile="POS-001"
        checklistType="Opening"
        onComplete={vi.fn()}
      />
    );
    
    await waitFor(() => {
      expect(screen.getByText('checklist.title_opening')).toBeTruthy();
    });
  });

  it('renders closing checklist title', async () => {
    mockGetChecklist.mockResolvedValueOnce({
      items: [],
      logName: 'LOG-001',
      logStatus: 'Incomplete',
    });
    mockSubmitChecklist.mockResolvedValueOnce({ status: 'Complete' });
    
    render(
      <ChecklistGateDialog
        posProfile="POS-001"
        checklistType="Closing"
        onComplete={vi.fn()}
      />
    );
    
    await waitFor(() => {
      expect(screen.getByText('checklist.title_closing')).toBeTruthy();
    });
  });

  it('auto-submits empty checklist', async () => {
    const onComplete = vi.fn();
    mockGetChecklist.mockResolvedValueOnce({
      items: [],
      logName: 'LOG-001',
      logStatus: 'Incomplete',
    });
    mockSubmitChecklist.mockResolvedValueOnce({ status: 'Complete' });
    
    render(
      <ChecklistGateDialog
        posProfile="POS-001"
        checklistType="Opening"
        onComplete={onComplete}
      />
    );
    
    await waitFor(() => {
      expect(mockSubmitChecklist).toHaveBeenCalledWith('POS-001', 'Opening', [], 'LOG-001');
      expect(onComplete).toHaveBeenCalled();
    });
  });

  it('renders checklist items', async () => {
    mockGetChecklist.mockResolvedValueOnce({
      items: [
        { item_label: 'Check cash drawer', is_mandatory: true },
        { item_label: 'Verify opening balance', is_mandatory: false },
      ],
      logName: 'LOG-001',
      logStatus: 'Incomplete',
    });
    
    render(
      <ChecklistGateDialog
        posProfile="POS-001"
        checklistType="Opening"
        onComplete={vi.fn()}
      />
    );
    
    await waitFor(() => {
      expect(screen.getByText('Check cash drawer')).toBeTruthy();
      expect(screen.getByText('Verify opening balance')).toBeTruthy();
    });
  });

  it('marks mandatory items with asterisk', async () => {
    mockGetChecklist.mockResolvedValueOnce({
      items: [
        { item_label: 'Mandatory item', is_mandatory: true },
      ],
      logName: 'LOG-001',
      logStatus: 'Incomplete',
    });
    
    render(
      <ChecklistGateDialog
        posProfile="POS-001"
        checklistType="Opening"
        onComplete={vi.fn()}
      />
    );
    
    await waitFor(() => {
      const label = screen.getByText('Mandatory item');
      const parent = label.closest('span');
      expect(parent?.textContent).toContain('*');
    });
  });

  it('allows checking items', async () => {
    mockGetChecklist.mockResolvedValueOnce({
      items: [
        { item_label: 'Test item', is_mandatory: true },
      ],
      logName: 'LOG-001',
      logStatus: 'Incomplete',
    });
    
    render(
      <ChecklistGateDialog
        posProfile="POS-001"
        checklistType="Opening"
        onComplete={vi.fn()}
      />
    );
    
    await waitFor(() => {
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeTruthy();
    });
  });

  it('disables submit button when mandatory items are not checked', async () => {
    mockGetChecklist.mockResolvedValueOnce({
      items: [
        { item_label: 'Mandatory item', is_mandatory: true },
      ],
      logName: 'LOG-001',
      logStatus: 'Incomplete',
    });
    
    render(
      <ChecklistGateDialog
        posProfile="POS-001"
        checklistType="Opening"
        onComplete={vi.fn()}
      />
    );
    
    await waitFor(() => {
      const submitButton = screen.getByText('checklist.submit');
      expect(submitButton.closest('button')?.hasAttribute('disabled')).toBe(true);
    });
  });

  it('enables submit button when all mandatory items are checked', async () => {
    mockGetChecklist.mockResolvedValueOnce({
      items: [
        { item_label: 'Mandatory item', is_mandatory: true },
      ],
      logName: 'LOG-001',
      logStatus: 'Incomplete',
    });
    
    render(
      <ChecklistGateDialog
        posProfile="POS-001"
        checklistType="Opening"
        onComplete={vi.fn()}
      />
    );
    
    await waitFor(() => {
      const checkbox = screen.getByRole('checkbox');
      userEvent.click(checkbox);
    });
    
    await waitFor(() => {
      const submitButton = screen.getByText('checklist.submit');
      expect(submitButton.closest('button')?.hasAttribute('disabled')).toBe(false);
    });
  });

  it('displays error message on load failure', async () => {
    mockGetChecklist.mockRejectedValueOnce(new Error('Network error'));
    
    render(
      <ChecklistGateDialog
        posProfile="POS-001"
        checklistType="Opening"
        onComplete={vi.fn()}
      />
    );
    
    await waitFor(() => {
      expect(screen.getByText(/checklist.load_failed|Network error/)).toBeTruthy();
    });
  });

  it('submits checklist with checked items', async () => {
    const onComplete = vi.fn();
    mockGetChecklist.mockResolvedValueOnce({
      items: [
        { item_label: 'Item 1', is_mandatory: true },
      ],
      logName: 'LOG-001',
      logStatus: 'Incomplete',
    });
    mockSubmitChecklist.mockResolvedValueOnce({ status: 'Complete' });
    
    render(
      <ChecklistGateDialog
        posProfile="POS-001"
        checklistType="Opening"
        onComplete={onComplete}
      />
    );
    
    await waitFor(() => {
      const checkbox = screen.getByRole('checkbox');
      userEvent.click(checkbox);
    });
    
    await waitFor(() => {
      const submitButton = screen.getByText('checklist.submit');
      userEvent.click(submitButton);
    });
    
    await waitFor(() => {
      expect(mockSubmitChecklist).toHaveBeenCalled();
    });
  });
});
