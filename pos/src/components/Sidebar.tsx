import { Grid3X3, Sparkles } from 'lucide-react';
import { CategoryIcon } from '../lib/category-icons';
import { usePOSStore } from '../store/pos-store';
import { SidebarContainer, SidebarCard, SidebarActiveIndicator, sidebarItemVariants, Button, Badge } from '@ury/ui';
import CommentDialog from './CommentDialog';
import { useState } from 'react';
import { t } from '../i18n';

interface SidebarProps {
  disabled?: boolean;
  className?: string;
  /**
   * Called after a category is picked. On a tablet this rail lives inside a
   * sheet (UX-06), and leaving the sheet open over the results it just
   * filtered would hide the very menu the cashier asked for.
   */
  onCategorySelect?: (category: string) => void;
}

const Sidebar = ({ disabled, className, onCategorySelect }: SidebarProps) => {
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

  const chooseCategory = (category: string) => {
    setSelectedCategory(category);
    onCategorySelect?.(category);
  };

  return (
    <SidebarContainer disabled={disabled} className={className}>
      {/* Categories List */}
      <nav className="flex-1 p-4 overflow-y-auto">
        <SidebarCard className="bg-transparent border-0 p-1">
          {/* Section Title */}
          <div className="flex items-center gap-2 px-2 mb-4">
            <Sparkles className="w-4 h-4 text-primary" />
            <h2 className="text-[11px] font-bold text-[#8f6b55] uppercase tracking-[0.16em]">
            {t('pos_sidebar.categories')}
            </h2>
          </div>
          
          {/* All Items */}
          <Button
            onClick={() => chooseCategory('')}
            variant="ghost"
            className={sidebarItemVariants({ active: selectedCategory === '' }) + ' mb-1'}
            disabled={disabled}
          >
            {/* Active indicator bar */}
            {selectedCategory === '' && <SidebarActiveIndicator />}
            
            <div className="flex items-center gap-3 ms-1">
              <Grid3X3 className="w-4 h-4 text-primary" />
              <span>{t('pos_sidebar.all_items')}</span>
            </div>
            
            <Badge variant="secondary" size="sm" className="text-xs text-[#8f6b55] bg-[#fff0cb] min-w-[24px] text-center">
              {getAllItemsCount()}
            </Badge>
          </Button>

          {/* Divider */}
          <div className="h-px bg-[#eadfce] my-3 mx-1" />

          {/* Category Items */}
          <div className="space-y-1">
            {categories.map((category) => {
              const count = getCategoryCount(category.name);
              const isActive = selectedCategory === category.name;
              return (
                <Button
                  key={category.name}
                  onClick={() => chooseCategory(category.name)}
                  variant="ghost"
                  className={sidebarItemVariants({ active: isActive })}
                  disabled={disabled}
                >
                  {/* Active indicator bar */}
                  {isActive && <SidebarActiveIndicator />}
                  <div className="flex items-center gap-3 ms-1">
                    <CategoryIcon
                      name={category.icon}
                      courseName={category.name}
                      className="w-4 h-4 text-[#8f6b55] flex-shrink-0"
                    />
                    <span className="text-start">{category.label}</span>
                  </div>
                  <Badge variant="secondary" size="sm" className="text-xs text-[#8f6b55] bg-[#fff0cb] min-w-[24px] text-center">
                    {count}
                  </Badge>
                </Button>
              );
            })}
          </div>
        </SidebarCard>
      </nav>

      {/* Comment Dialog is rendered from sidebar but triggered from order panel, to not mount it on every order panel render */}
      <CommentDialog
        isOpen={showCommentDialog}
        onClose={() => setShowCommentDialog(false)}
        onSave={handleCommentSave}
        initialComment={orderComment}
      />
    </SidebarContainer>
  );
};

export default Sidebar; 