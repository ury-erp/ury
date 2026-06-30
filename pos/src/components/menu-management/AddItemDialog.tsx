import { useState } from 'react';
import { Search, Plus, X } from 'lucide-react';
import { Button, Input } from '../ui';
import { useMenuManagementStore } from '../../store/menu-management-store';
import { URYMenuCourse, AvailableItem } from '../../lib/menu-management-api';
import { formatCurrency } from '../../lib/utils';

interface AddItemDialogProps {
  menuName: string;
  courses: URYMenuCourse[];
  onClose: () => void;
}

const AddItemDialog = ({ menuName, courses, onClose }: AddItemDialogProps) => {
  const { availableItems, addItemToMenu } = useMenuManagementStore();
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<AvailableItem | null>(null);
  const [rate, setRate] = useState<number>(0);
  const [course, setCourse] = useState<string>('');
  const [specialDish, setSpecialDish] = useState(0);
  const [adding, setAdding] = useState(false);

  const filteredItems = availableItems.filter(
    (item) =>
      !search ||
      item.item_name.toLowerCase().includes(search.toLowerCase()) ||
      item.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelectItem = (item: AvailableItem) => {
    setSelectedItem(item);
    setRate(item.standard_rate || 0);
  };

  const handleAdd = async () => {
    if (!selectedItem || rate <= 0) return;
    setAdding(true);
    try {
      await addItemToMenu(menuName, selectedItem.name, rate, course || null, specialDish);
      onClose();
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden m-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Add Item to Menu</h2>
          <Button variant="ghost" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {!selectedItem ? (
          /* Item search/select */
          <div className="flex-1 overflow-y-auto p-4">
            <div className="relative mb-4">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search items to add..."
                className="ps-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1 max-h-[50vh] overflow-y-auto">
              {filteredItems.map((item) => (
                <button
                  key={item.name}
                  className="w-full flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg text-start transition-colors"
                  onClick={() => handleSelectItem(item)}
                >
                  <div>
                    <p className="font-medium text-sm text-gray-900">
                      {item.item_name}
                    </p>
                    <p className="text-xs text-gray-400">
                      {item.name} | {item.item_group}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-gray-600">
                    {formatCurrency(item.standard_rate)}
                  </span>
                </button>
              ))}
              {filteredItems.length === 0 && (
                <p className="text-center text-gray-400 py-8">No items found</p>
              )}
            </div>
          </div>
        ) : (
          /* Item configuration */
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="font-medium">{selectedItem.item_name}</p>
              <p className="text-xs text-gray-400">{selectedItem.name}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price
              </label>
              <Input
                type="number"
                step="0.01"
                value={rate}
                onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Course / Category
              </label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                value={course}
                onChange={(e) => setCourse(e.target.value)}
              >
                <option value="">No course</option>
                {courses.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.course}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="special_dish"
                checked={specialDish === 1}
                onChange={(e) => setSpecialDish(e.target.checked ? 1 : 0)}
                className="rounded"
              />
              <label htmlFor="special_dish" className="text-sm text-gray-700">
                Mark as Special Dish
              </label>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setSelectedItem(null)}
                className="flex-1"
              >
                Back
              </Button>
              <Button
                onClick={handleAdd}
                disabled={adding || rate <= 0}
                className="flex-1"
              >
                <Plus className="w-4 h-4 me-1" />
                {adding ? 'Adding...' : 'Add to Menu'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AddItemDialog;
