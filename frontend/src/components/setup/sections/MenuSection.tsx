import React from 'react';
import { useConfigure } from '../../../context/ConfigureContext';
import { Input, Button } from '@ury/ui';
import { Plus, Trash2 } from 'lucide-react';
import { SearchableSelect } from '../../common/SearchableSelect';
import { Switch } from '../../ui/switch';
import { MenuBulkUpload } from '../../common/MenuBulkUpload';

const COURSE_OPTIONS = [
  { value: 'Starters', label: 'Starters' },
  { value: 'Main Course', label: 'Main Course' },
  { value: 'Beverages', label: 'Beverages' },
  { value: 'Desserts', label: 'Desserts' },
  { value: 'Sides', label: 'Sides' },
];

export function MenuSection() {
  const {
    branch,
    menuItems,
    addMenuItem,
    addMenuItems,
    updateMenuItem,
    deleteMenuItem,
    menuFile,
    setMenuFile,
    taxConfig,
    updateTaxConfig,
  } = useConfigure();

  const currencyLabel = (window as any).frappe?.boot?.sysdefaults?.currency;
  const priceColumnLabel = currencyLabel ? `Price (${currencyLabel})` : 'Price';

  const handleAdd = () => {
    addMenuItem({
      name: '',
      course: 'Main Course',
      price: 0,
    });
  };

  return (
    <div className="space-y-8">
      {/* 1. Bulk Menu Upload */}
      <MenuBulkUpload
        onItemsParsed={addMenuItems}
        title="Bulk Menu Upload"
        subtitle=""
        file={menuFile}
        onFileChange={setMenuFile}
      />

      {/* 2. Tax Settings */}
      {branch.taxId && branch.taxId.trim() !== '' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full items-center">
          <div className="flex items-center gap-3">
            <Switch
              id="tax-inclusive"
              checked={taxConfig.taxType === 'Inclusive'}
              onCheckedChange={(checked: boolean) =>
                updateTaxConfig({ taxType: checked ? 'Inclusive' : 'Exclusive' })
              }
            />
            <div>
              <label
                htmlFor="tax-inclusive"
                className="text-sm font-medium text-foreground cursor-pointer"
              >
                {taxConfig.taxType === 'Inclusive' ? 'Tax Inclusive' : 'Tax Exclusive'}
              </label>
              <p className="text-xs text-muted-foreground">
                {taxConfig.taxType === 'Inclusive'
                  ? 'the tax amount will be considered as already included in the Print Rate / Print Amount'
                  : 'The tax amount will be calculated separately and added to the Print Rate / Print Amount.'}
              </p>
            </div>
          </div>

          <div className="space-y-1.5 w-full">
            <label className="text-sm font-medium text-foreground">Tax Rate</label>
            <Input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={taxConfig.taxPercentage}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                updateTaxConfig({ taxPercentage: parseFloat(e.target.value) || 0 })
              }
              placeholder="5"
              className="w-full text-sm bg-white"
            />
          </div>
        </div>
      )}

      {/* 3. Menu Items List */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Menu Items</h3>

        <div className="space-y-3">
          {/* Header Row */}
          <div className="hidden md:flex gap-3 px-2 text-xs font-medium text-muted-foreground">
            <div className="flex-1">Item Name</div>
            <div className="flex-1">Course</div>
            <div className="flex-1">{priceColumnLabel}</div>
            {menuItems.length > 1 && <div className="w-8"></div>}
          </div>

          {menuItems.map((item) => (
            <div
              key={item.id}
              className="py-2 flex flex-col md:flex-row md:items-center gap-3"
            >
              <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Input
                    type="text"
                    value={item.name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      updateMenuItem(item.id, { name: e.target.value })
                    }
                    placeholder="Item Name"
                    className="w-full text-sm bg-white"
                  />
                </div>

                <div>
                  <SearchableSelect
                    id={`course-${item.id}`}
                    value={item.course}
                    options={COURSE_OPTIONS}
                    onChange={(_id, value) => updateMenuItem(item.id, { course: value })}
                    placeholder="Course"
                  />
                </div>

                <div>
                  <Input
                    type="number"
                    min={0}
                    value={item.price}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      updateMenuItem(item.id, { price: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="0.00"
                    className="w-full text-sm bg-white"
                  />
                </div>
              </div>

              {menuItems.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => deleteMenuItem(item.id)}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 self-end md:self-center shrink-0 p-2 h-auto"
                  title="Delete Item"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={handleAdd}
          className="w-full py-2.5 border-dashed border-primary text-primary hover:bg-primary/10 flex items-center justify-center gap-2 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Menu Item
        </Button>
      </div>
    </div>
  );
}
