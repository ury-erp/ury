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

// STATE 2 of the gate UX: an eligible user lands on a "Start Checklist"
// screen first -- every test that interacts with the form clicks through it.
const startChecklist = async () => {
  const startButton = await screen.findByText('checklist.start');
  await userEvent.click(startButton);
};

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

    await startChecklist();
    await waitFor(() => {
      expect(screen.getByText(/Check cash drawer/)).toBeTruthy();
      expect(screen.getByText(/Verify opening balance/)).toBeTruthy();
    });
  });

  it('offers Start Checklist to an eligible user before showing the form', async () => {
    mockGetChecklist.mockResolvedValueOnce({
      items: [{ item_label: 'Mandatory item', is_mandatory: true }],
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

    // STATE 2: required-heading + Start action, but no form yet.
    await waitFor(() => {
      expect(screen.getByText('checklist.blocked_heading')).toBeTruthy();
      expect(screen.getByText('checklist.start')).toBeTruthy();
    });
    expect(screen.queryByRole('radio')).toBeNull();

    await startChecklist();
    await waitFor(() => {
      expect(screen.getAllByRole('radio')).toHaveLength(2);
    });
  });

  it('rechecks the gate from the blocked state when the predecessor finishes', async () => {
    mockGetChecklist
      .mockResolvedValueOnce({
        items: [],
        logName: null,
        logStatus: null,
        blockedBy: { role: 'Restaurant Manager', role_label: 'Restaurant Manager', goals: ['RM Opening Checklist'] },
      })
      .mockResolvedValueOnce({
        items: [{ item_label: 'Mandatory item', is_mandatory: true }],
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

    // STATE 1: blocked -- no Start action, but a Recheck path.
    await waitFor(() => {
      expect(screen.getByText('checklist.blocked_message')).toBeTruthy();
      expect(screen.getByText('checklist.recheck')).toBeTruthy();
    });
    expect(screen.queryByText('checklist.start')).toBeNull();

    // The RM submits elsewhere; Recheck reloads the gate and now the
    // user is eligible (STATE 2).
    await userEvent.click(screen.getByText('checklist.recheck'));
    await waitFor(() => {
      expect(screen.getByText('checklist.start')).toBeTruthy();
    });
    expect(mockGetChecklist).toHaveBeenCalledTimes(2);
  });

  it('retries loading after a load failure', async () => {
    mockGetChecklist
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        items: [{ item_label: 'Mandatory item', is_mandatory: true }],
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
      expect(screen.getByText(/Network error/)).toBeTruthy();
    });
    await userEvent.click(screen.getByText('checklist.retry'));
    await waitFor(() => {
      expect(screen.getByText('checklist.start')).toBeTruthy();
    });
    expect(mockGetChecklist).toHaveBeenCalledTimes(2);
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
    
    await startChecklist();
    await waitFor(() => {
      const label = screen.getByText(/Mandatory item/);
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
    
    await startChecklist();
    await waitFor(() => {
      expect(screen.getAllByRole('radio')).toHaveLength(2);
    });
  });

  it('disables submit button when mandatory items have no result', async () => {
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
    
    await startChecklist();
    await waitFor(() => {
      const submitButton = screen.getByText('checklist.submit');
      expect(submitButton.closest('button')?.hasAttribute('disabled')).toBe(true);
    });
  });

  it('enables submit button when all mandatory items are answered', async () => {
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
    
    await startChecklist();
    await waitFor(() => {
      expect(screen.getAllByRole('radio')).toHaveLength(2);
    });
    userEvent.click(screen.getAllByRole('radio')[0]);
    
    await waitFor(() => {
      const submitButton = screen.getByText('checklist.submit');
      expect(submitButton.closest('button')?.hasAttribute('disabled')).toBe(false);
    });
  });

  it('blocks submit when FAIL has no remarks', async () => {
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
    
    await startChecklist();
    await waitFor(() => {
      expect(screen.getAllByRole('radio')).toHaveLength(2);
    });
    await userEvent.click(screen.getAllByRole('radio')[1]); // FAIL
    
    await waitFor(() => {
      expect(screen.getByText('checklist.fail_remarks_required')).toBeTruthy();
    });
    const submitButton = screen.getByText('checklist.submit');
    expect(submitButton.closest('button')?.hasAttribute('disabled')).toBe(true);
  });

  it('prefills a previously saved FAIL result and remarks on reopen', async () => {
    mockGetChecklist.mockResolvedValueOnce({
      items: [
        { item_label: 'Mandatory item', is_mandatory: true, status: 'Failed', remarks: 'Printer broken' },
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
    
    await startChecklist();
    await waitFor(() => {
      expect(screen.getAllByRole('radio')).toHaveLength(2);
    });
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios[1].checked).toBe(true); // FAIL preselected
    expect(screen.getByDisplayValue('Printer broken')).toBeTruthy();
    const submitButton = screen.getByText('checklist.submit');
    expect(submitButton.closest('button')?.hasAttribute('disabled')).toBe(false);
  });


  it('shows the blocking role message when a predecessor checklist is unfinished', async () => {
    mockGetChecklist.mockResolvedValueOnce({
      items: [],
      logName: null,
      logStatus: null,
      blockedBy: { role: 'Restaurant Manager', role_label: 'Restaurant Manager', goals: ['RM Opening Checklist'] },
    });
    render(
      <ChecklistGateDialog
        posProfile="POS-001"
        checklistType="Opening"
        onComplete={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('checklist.blocked_heading')).toBeTruthy();
    });
    expect(screen.getByText('checklist.blocked_message')).toBeTruthy();
    expect(screen.getByText('checklist.recheck')).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByText('checklist.submit')).toBeNull();
    expect(screen.queryByText('checklist.start')).toBeNull();
  });


  it('accepts a FAIL with remarks and completes the gate', async () => {
    mockGetChecklist.mockResolvedValue({
      items: [
        { item_label: 'Mandatory item', is_mandatory: true },
      ],
      logName: 'LOG-001',
      logStatus: 'Incomplete',
    });
    mockSubmitChecklist.mockResolvedValue({ status: 'Complete' });
    const onComplete = vi.fn();
    render(
      <ChecklistGateDialog
        posProfile="POS-001"
        checklistType="Opening"
        onComplete={onComplete}
      />
    );
    await startChecklist();
    await waitFor(() => {
      expect(screen.getAllByRole('radio')).toHaveLength(2);
    });
    await userEvent.click(screen.getAllByRole('radio')[1]); // FAIL
    await userEvent.type(screen.getByPlaceholderText('checklist.fail_remarks_placeholder'), 'test');
    await userEvent.click(screen.getByText('checklist.submit'));
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
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

  it('submits checklist with explicit PASS results', async () => {
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
    
    await startChecklist();
    await waitFor(() => {
      expect(screen.getAllByRole('radio')).toHaveLength(2);
    });
    userEvent.click(screen.getAllByRole('radio')[0]); // PASS
    
    await waitFor(() => {
      const submitButton = screen.getByText('checklist.submit');
      expect(submitButton.closest('button')?.hasAttribute('disabled')).toBe(false);
    });
    userEvent.click(screen.getByText('checklist.submit'));
    
    await waitFor(() => {
      expect(mockSubmitChecklist).toHaveBeenCalled();
    });
    const submitted = mockSubmitChecklist.mock.calls[0][2];
    expect(submitted[0]).toEqual(
      expect.objectContaining({ item_label: 'Item 1', status: 'Passed' })
    );
  });
});
