import React, { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { useConfigure } from '../../../context/ConfigureContext';
import { Input, Button } from '@ury/ui';
import { Plus, Trash2, Upload, FileText, X, Download } from 'lucide-react';
import { SearchableSelect } from '../../common/SearchableSelect';
import { Switch } from '../../ui/switch';

const COURSE_OPTIONS = [
  { value: 'Starters', label: 'Starters' },
  { value: 'Main Course', label: 'Main Course' },
  { value: 'Beverages', label: 'Beverages' },
  { value: 'Desserts', label: 'Desserts' },
  { value: 'Sides', label: 'Sides' },
];

interface ParsedMenuRow {
  name: string;
  course: string;
  price: number;
}

/** Splits a single CSV line into raw cell values, honoring double-quoted fields (with "" escapes). */
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

/**
 * Parses the menu CSV template (matches ury/public/files/menu_template.csv):
 *   "Bulk Edit Items"
 *   "Item","Item Name","Rate","Special Dish","Disabled","Course Icon","Course"
 *   "item","item_name","rate","special_dish","disabled","course_icon","course"
 *   ...instructions / separator rows...
 *   "CB","Chicken Biriyani",250,1,0,"","Main Courses"
 *
 * Falls back to a plain name,course,price layout if the template's "Item Name"
 * header isn't found, so a simpler hand-written CSV still imports.
 */
function parseMenuCsv(text: string): ParsedMenuRow[] {
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];

  let headerIndex = -1;
  let nameIndex = -1;
  let courseIndex = -1;
  let priceIndex = -1;

  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const cells = parseCsvLine(lines[i]);
    const foundNameIndex = cells.findIndex((cell) => cell.toLowerCase() === 'item name');
    if (foundNameIndex !== -1) {
      headerIndex = i;
      nameIndex = foundNameIndex;
      courseIndex = cells.findIndex((cell) => cell.toLowerCase() === 'course');
      priceIndex = cells.findIndex((cell) => cell.toLowerCase() === 'rate');
      break;
    }
  }

  if (headerIndex === -1) {
    // Fall back to a simple name,course,price CSV with a header row.
    headerIndex = 0;
    nameIndex = 0;
    courseIndex = 1;
    priceIndex = 2;
  }

  const rows: ParsedMenuRow[] = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const name = (cells[nameIndex] || '').trim();
    if (!name) continue;
    // Skip the machine-readable field-name row (e.g. "item_name") that follows the label row.
    if (name.toLowerCase() === 'item_name' || name.toLowerCase() === 'item name') continue;

    const course = (cells[courseIndex] || '').trim();
    const price = parseFloat(cells[priceIndex]) || 0;
    rows.push({ name, course, price });
  }

  return rows;
}

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

  const [isDragging, setIsDragging] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currencyLabel = (window as any).frappe?.boot?.sysdefaults?.currency;
  const priceColumnLabel = currencyLabel ? `Price (${currencyLabel})` : 'Price';

  const handleAdd = () => {
    addMenuItem({
      name: '',
      course: 'Main Course',
      price: 0,
    });
  };

  const importFile = async (file: File) => {
    if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
    setImportMessage(null);
    setImportError(null);
    setMenuFile(file);

    try {
      const text = await file.text();
      const rows = parseMenuCsv(text);

      if (rows.length === 0) {
        setImportError("Couldn't read that file , make sure it matches the template format.");
        return;
      }

      addMenuItems(rows);
      setImportMessage(`Imported ${rows.length} item${rows.length === 1 ? '' : 's'} from ${file.name} , review and edit below.`);
      messageTimeoutRef.current = setTimeout(() => setImportMessage(null), 5000);
    } catch {
      setImportError("Couldn't read that file , make sure it matches the template format.");
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      importFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      importFile(e.target.files[0]);
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. Bulk Menu Upload */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Bulk Menu Upload</h3>
          <a href="/assets/ury/files/menu_template.csv" download className="text-xs font-medium text-primary hover:underline flex items-center gap-1">
            <Download className="w-3 h-3" /> Download Template
          </a>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="hidden"
        />

        {menuFile ? (
          <div className="p-3 border border-primary bg-primary/10 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              <div>
                <p className="text-xs font-medium text-foreground">{menuFile.name}</p>
                <p className="text-[10px] text-muted-foreground">{(menuFile.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setMenuFile(null);
                setImportMessage(null);
                setImportError(null);
              }}
              className="text-muted-foreground hover:text-destructive p-1 h-auto"
              title="Remove File"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`p-4 border border-dashed rounded-lg text-center cursor-pointer transition-colors ${
              isDragging
                ? 'border-primary bg-primary/10'
                : 'border-border hover:border-primary bg-muted'
            }`}
          >
            <Upload className="w-5 h-5 text-muted-foreground mx-auto mb-1.5" />
            <p className="text-xs font-medium text-foreground">
              Drag &amp; drop CSV template here, or <span className="text-primary">browse</span>
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Supports CSV files only</p>
          </div>
        )}

        {importMessage && (
          <p className="text-xs font-medium text-primary">{importMessage}</p>
        )}
        {importError && (
          <p className="text-xs font-medium text-destructive">{importError}</p>
        )}
      </div>

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
                  className="text-destructive hover:text-destructive hover:bg-destructive-tint self-end md:self-center shrink-0 p-2 h-auto"
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
