import { usePOSStore } from '../store/pos-store';
import { cn } from '../lib/utils';
import CommentDialog from './CommentDialog';
import { useState } from 'react';
import { t } from '../i18n';

interface SidebarProps {
  disabled?: boolean;
}

const Sidebar = ({ disabled }: SidebarProps) => {
  const { selectedCategory, setSelectedCategory, menuItems, categories, orderComment, setOrderComment } = usePOSStore();
  const [showCommentDialog, setShowCommentDialog] = useState(false);

  // Count items per category
  const getCategoryCount = (category: string) => {
    const count = menuItems.filter(item => item.course === category).length;
    return count;
  };

  const getAllItemsCount = () => {
    const count = menuItems.length;
    return count;
  };

  const handleCommentSave = (comment: string) => {
    setOrderComment(comment);
  };

  // Course tiles, not a list: the staff came from a touch system where every
  // course was a big labelled button, and a two-column grid of tiles fits the
  // whole course list on screen in half the width a padded list needed.
  const CourseTile = ({
    label,
    count,
    active,
    onClick,
  }: {
    label: string;
    count: number;
    active: boolean;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        'relative h-16 w-full rounded-md border px-2 pt-2 pb-4 flex items-center justify-center text-center',
        'text-[13px] font-bold uppercase leading-[0.95rem] tracking-tight transition-colors',
        'disabled:opacity-50 disabled:pointer-events-none shadow-md shadow-cyan-900/25',
        active
          ? 'bg-primary-600 border-primary-600 text-white'
          : 'bg-white border-gray-200 text-gray-900 hover:bg-primary-50 hover:border-primary-200 hover:text-primary-700'
      )}
    >
      <span className="line-clamp-2 break-words">{label}</span>
      <span
        className={cn(
          'absolute bottom-0.5 end-1.5 text-[11px] font-medium tabular-nums',
          active ? 'text-white/80' : 'text-gray-500'
        )}
      >
        {count}
      </span>
    </button>
  );

  return (
    <div className={cn(
      "w-64 flex-shrink-0 bg-cyan-200 border-e border-cyan-300 h-full flex flex-col",
      disabled && "opacity-50 pointer-events-none"
    )}>
      {/* Categories */}
      <nav className="flex-1 py-4 pe-4 ps-5 overflow-y-auto">
        <h2 className="text-xs font-semibold text-cyan-900 uppercase tracking-wider mb-2">
          {t('pos_sidebar.categories')}
        </h2>

        <div className="grid grid-cols-2 gap-2">
          <CourseTile
            label={t('pos_sidebar.all_items')}
            count={getAllItemsCount()}
            active={selectedCategory === ''}
            onClick={() => setSelectedCategory('')}
          />

          {categories.map((category) => (
            <CourseTile
              key={category.name}
              label={category.label}
              count={getCategoryCount(category.name)}
              active={selectedCategory === category.name}
              onClick={() => setSelectedCategory(category.name)}
            />
          ))}
        </div>
      </nav>

      {/* Comment Dialog is rendered from sidebar but triggered from order panel, to not mount it on every order panel render */}
      <CommentDialog
        isOpen={showCommentDialog}
        onClose={() => setShowCommentDialog(false)}
        onSave={handleCommentSave}
        initialComment={orderComment}
      />
    </div>
  );
};

export default Sidebar;
