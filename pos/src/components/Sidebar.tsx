import { 
  Grid3X3,
  UtensilsCrossed,
} from 'lucide-react';
import { usePOSStore } from '../store/pos-store';
import { cn } from '../lib/utils';
import { Button, Badge } from './ui';
import CommentDialog from './CommentDialog';
import { useState } from 'react';

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
    <div className={cn(
      "w-64 bg-white border-r border-gray-200 h-screen flex flex-col",
      disabled && "opacity-50 pointer-events-none"
    )}>
      {/* Categories List */}
      <nav className="flex-1 p-6 overflow-y-auto">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          {/* Section Title */}
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3 px-1">
            categories
          </h2>
          
          {/* All Items */}
          <Button
            onClick={() => setSelectedCategory('')}
            variant="ghost"
            className={cn(
              'w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium transition-all duration-200 group relative mb-1',
              selectedCategory === ''
                ? 'bg-white text-gray-900 shadow-sm font-semibold'
                : 'text-gray-700 hover:bg-white/60 hover:text-gray-900'
            )}
            disabled={disabled}
          >
            {/* Active indicator bar */}
            {selectedCategory === '' && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-600 rounded-r-full" />
            )}
            
            <div className="flex items-center gap-3 ml-1">
              <Grid3X3 className="w-4 h-4 text-gray-500" />
              <span>All Items</span>
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
              const count = getCategoryCount(category);
              return (
                <Button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  variant="ghost"
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium transition-all duration-200 group relative',
                    selectedCategory === category
                      ? 'bg-white text-gray-900 shadow-sm font-semibold'
                      : 'text-gray-700 hover:bg-white/60 hover:text-gray-900'
                  )}
                  disabled={disabled}
                >
                  {/* Active indicator bar */}
                  {selectedCategory === category && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-600 rounded-r-full" />
                  )}
                  <div className="flex items-center gap-3 ml-1">
                    <UtensilsCrossed className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <span className="text-start">{category}</span>
                  </div>
                  <Badge variant="secondary" size="sm" className="text-xs text-gray-500 bg-gray-100 min-w-[24px] text-center">
                    {count}
                  </Badge>
                </Button>
              );
            })}
          </div>
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