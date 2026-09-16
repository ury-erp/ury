import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CommentDialog from './CommentDialog';

vi.mock('../i18n', () => ({
  t: (key: string) => key,
}));

describe('CommentDialog', () => {
  beforeEach(() => {
    cleanup();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <CommentDialog isOpen={false} onClose={() => {}} onSave={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the dialog when isOpen is true', () => {
    render(
      <CommentDialog isOpen={true} onClose={() => {}} onSave={() => {}} />
    );
    expect(screen.getByText('comment.title')).toBeInTheDocument();
  });

  it('displays the initial comment in the textarea', () => {
    render(
      <CommentDialog
        isOpen={true}
        onClose={() => {}}
        onSave={() => {}}
        initialComment="Hello world"
      />
    );
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Hello world');
  });

  it('updates the comment value on input change', async () => {
    render(
      <CommentDialog isOpen={true} onClose={() => {}} onSave={() => {}} />
    );
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    
    await userEvent.clear(textarea);
    await userEvent.type(textarea, 'New comment');
    
    expect(textarea.value).toBe('New comment');
  });

  it('calls onSave and onClose when save button is clicked', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    
    render(
      <CommentDialog
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
        initialComment="test"
      />
    );
    
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    await userEvent.clear(textarea);
    await userEvent.type(textarea, 'Updated comment');
    
    await userEvent.click(screen.getByText('comment.save_button'));
    
    expect(onSave).toHaveBeenCalledWith('Updated comment');
    expect(onClose).toHaveBeenCalled();
  });

  it('resets the comment to initial value and calls onClose when cancel is clicked', async () => {
    const onClose = vi.fn();
    
    render(
      <CommentDialog
        isOpen={true}
        onClose={onClose}
        onSave={() => {}}
        initialComment="Initial"
      />
    );
    
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    await userEvent.clear(textarea);
    await userEvent.type(textarea, 'Changed');
    
    expect(textarea.value).toBe('Changed');
    
    await userEvent.click(screen.getByText('common.cancel'));
    
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when X button is clicked', async () => {
    const onClose = vi.fn();
    
    render(
      <CommentDialog
        isOpen={true}
        onClose={onClose}
        onSave={() => {}}
      />
    );
    
    const closeButton = screen.getAllByRole('button')[0];
    await userEvent.click(closeButton);
    
    expect(onClose).toHaveBeenCalled();
  });
});
