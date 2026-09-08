import { CommentDialog as CommentDialogView } from '@ury/ui';
import { t } from '../i18n';

interface CommentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (comment: string) => void;
  initialComment?: string;
}

const CommentDialog = ({ isOpen, onClose, onSave, initialComment = '' }: CommentDialogProps) => (
  <CommentDialogView
    open={isOpen}
    onOpenChange={(next) => {
      if (!next) onClose();
    }}
    onSave={onSave}
    initialComment={initialComment}
    title={t('comment.title')}
    label={t('comment.label')}
    placeholder={t('comment.placeholder')}
    cancelLabel={t('common.cancel')}
    saveLabel={t('comment.save_button')}
  />
);

export default CommentDialog;
