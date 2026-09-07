import { Grid3X3 } from 'lucide-react';
import { CategoryIcon } from '../lib/category-icons';
import { usePOSStore } from '../store/pos-store';
import { SidebarContainer, SidebarCard, SidebarActiveIndicator, sidebarItemVariants, Button, Badge } from '@ury/ui';
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

  return (
    <SidebarContainer disabled={disabled}>
      {/* Categories List */}
      <nav className="flex-1 p-6 overflow-y-auto">
        <SidebarCard>
          {/* Section Title */}
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3 px-1">
            {t('pos_sidebar.categories')}
          </h2>
          
          {/* All Items */}
          <Button
            onClick={() => setSelectedCategory('')}
            variant="ghost"
            className={sidebarItemVariants({ active: selectedCategory === '' }) + ' mb-1'}
            disabled={disabled}
          >
            {/* Active indicator bar */}
            {selectedCategory === '' && <SidebarActiveIndicator />}
            
            <div className="flex items-center gap-3 ms-1">
              <Grid3X3 className="w-4 h-4 text-gray-500" />
              <span>{t('pos_sidebar.all_items')}</span>
            </div>
            
            <Badge variant="secondary" size="sm" className="text-xs text-gray-500 bg-gray-100 min-w-[24px] text-center">
              {getAllItemsCount()}
            </Badge>
          </Button>

          {/* Divider */}
          <div className="h-px bg-gray-200 my-3 mx-1" />

          {/* Category Items */}
          <div className="space-y-1">
            {categories.map((category) => {
              const count = getCategoryCount(category.name);
              const isActive = selectedCategory === category.name;
              return (
                <Button
                  key={category.name}
                  onClick={() => setSelectedCategory(category.name)}
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
                      className="w-4 h-4 text-gray-500 flex-shrink-0"
                    />
                    <span className="text-start">{category.label}</span>
                  </div>
                  <Badge variant="secondary" size="sm" className="text-xs text-gray-500 bg-gray-100 min-w-[24px] text-center">
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