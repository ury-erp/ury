import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '@ury/ui';

describe('ConfirmDialog rejected confirm', () => {
  it('keeps the dialog open and does not throw when onConfirm rejects', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn().mockRejectedValue(new Error('unmerge failed'));

    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Unmerge group"
        description="Split these tables?"
        confirmLabel="Unmerge"
        confirmVariant="danger"
        onConfirm={onConfirm}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Unmerge' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unmerge' })).toBeEnabled();
  });
});
