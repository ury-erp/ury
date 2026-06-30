import { useState } from 'react';
import { X, Check } from 'lucide-react';
import { Button, Input } from '../ui';
import { useMenuManagementStore } from '../../store/menu-management-store';
import { URYMenuItem, URYMenuCourse } from '../../lib/menu-management-api';

interface EditItemDialogProps {
  item: URYMenuItem;
  menuName: string;
  courses: URYMenuCourse[];
  onClose: () => void;
}

const EditItemDialog = ({ item, menuName, courses, onClose }: EditItemDialogProps) => {
  const { updateItemInMenu } = useMenuManagementStore();
  const [rate, setRate] = useState(item.rate);
  const [course, setCourse] = useState(item.course || '');
  const [specialDish, setSpecialDish] = useState(item.special_dish);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateItemInMenu(menuName, item.name, {
        rate,
        course: course || undefined,
        special_dish: specialDish,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md m-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Edit Menu Item</h2>
          <Button variant="ghost" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>
        <div className="p-4 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="font-medium">{item.item_name}</p>
            <p className="text-xs text-gray-400">{item.item}</p>
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
              id="edit_special_dish"
              checked={specialDish === 1}
              onChange={(e) => setSpecialDish(e.target.checked ? 1 : 0)}
              className="rounded"
            />
            <label htmlFor="edit_special_dish" className="text-sm text-gray-700">
              Special Dish
            </label>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              <Check className="w-4 h-4 me-1" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditItemDialog;
