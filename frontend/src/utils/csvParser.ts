export interface ParsedMenuRow {
  name: string;
  course: string;
  price: number;
}

/** Splits a single CSV line into raw cell values, honoring double-quoted fields (with "" escapes). */
export function parseCsvLine(line: string): string[] {
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
export function parseMenuCsv(text: string): ParsedMenuRow[] {
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
