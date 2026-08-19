import React, { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { useConfigure } from '../../../context/ConfigureContext';
import { Input, Button } from '@ury/ui';
import { Plus, Trash2, Upload, FileText, X, Download } from 'lucide-react';
import { SearchableSelect } from '../../common/SearchableSelect';

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
    menuItems,
    addMenuItem,
    addMenuItems,
    updateMenuItem,
    deleteMenuItem,
    menuFile,
    setMenuFile,
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
        setImportError("Couldn't read that file — make sure it matches the template format.");
        return;
      }

      addMenuItems(rows);
      setImportMessage(`Imported ${rows.length} item${rows.length === 1 ? '' : 's'} from ${file.name} — review and edit below.`);
      messageTimeoutRef.current = setTimeout(() => setImportMessage(null), 5000);
    } catch {
      setImportError("Couldn't read that file — make sure it matches the template format.");
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
      <p className="text-sm text-muted-foreground">
        Add a few items to get started — you can bulk-import or add hundreds more anytime later.
      </p>

      {/* 2. Menu Items List */}
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
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateMenuItem(item.id, { name: e.target.value })}
                    placeholder="e.g. Chicken Biriyani"
                    className="w-full text-sm bg-white"
                  />
                </div>

                <div>
                  <SearchableSelect
                    id={`course-${item.id}`}
                    value={item.course}
                    options={COURSE_OPTIONS}
                    onChange={(_id, value) => updateMenuItem(item.id, { course: value })}
                    placeholder="e.g. Main Course"
                  />
                </div>

                <div>
                  <Input
                    type="number"
                    min={0}
                    value={item.price}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateMenuItem(item.id, { price: parseFloat(e.target.value) || 0 })}
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

      {/* 3. Drag-and-Drop Menu File Uploader */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Bulk Menu Upload (Optional)</h3>
          <a href="/assets/ury/files/menu_template.csv" download className="text-xs font-medium text-primary hover:underline flex items-center gap-1">
            <Download className="w-3 h-3" /> Download Template
          </a>
        </div>

        <p className="text-xs text-muted-foreground">
          Prefer a spreadsheet? Download the template, fill it in, and upload it here instead of typing items one by one.
        </p>

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
              className="text-muted-foreground hover:text-red-600 p-1 h-auto"
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
              Drag & drop CSV template here, or <span className="text-primary">browse</span>
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Supports CSV files only</p>
          </div>
        )}

        {importMessage && (
          <p className="text-xs font-medium text-primary">{importMessage}</p>
        )}
        {importError && (
          <p className="text-xs font-medium text-red-600">{importError}</p>
        )}
      </div>
    </div>
  );
}
