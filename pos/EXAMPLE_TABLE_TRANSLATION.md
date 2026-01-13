# Example: How to Translate the Table Component

This is a step-by-step example showing how to update `Table.tsx` with Arabic translations.

## Before (Hardcoded English)

```tsx
// From Table.tsx - lines with hardcoded English text:

<div className="flex items-center gap-2 text-gray-500 text-sm">
  <AlertTriangle className="w-4 h-4" />
  No rooms found for this branch
</div>

<Badge variant={isOccupied ? 'warning' : 'success'}>
  {isOccupied ? 'Occupied' : 'Available'}
</Badge>

<span className="font-medium">Room</span>

<span className="font-medium">Started at</span>

<span className="font-medium">Seats</span>

<Badge variant="pending" className="mt-2">
  Take away
</Badge>

<Eye className="w-3 h-3" />
Preview

<Printer className="w-3 h-3" />
Print

<Loader2 className="w-3 h-3 animate-spin" />
Printing...

<p className="text-sm text-gray-500">Tap to start a new dine-in order</p>

<span>Available</span>
<span>Occupied</span>
```

## After (With Translations)

### Step 1: Import useTranslation at the top

```tsx
// Add this import at the top of Table.tsx
import { useTranslation } from 'react-i18next';
```

### Step 2: Add the hook inside the component

```tsx
const TableView = () => {
  const { t } = useTranslation();  // Add this line
  const navigate = useNavigate();
  // ... rest of the code
```

### Step 3: Replace hardcoded strings with t() calls

```tsx
// Replace:
No rooms found for this branch

// With:
{t('table.noRooms')}

// Replace:
{isOccupied ? 'Occupied' : 'Available'}

// With:
{isOccupied ? t('table.occupied') : t('table.available')}

// Replace:
<span className="font-medium">Room</span>

// With:
<span className="font-medium">{t('table.room')}</span>

// Replace:
<span className="font-medium">Started at</span>

// With:
<span className="font-medium">{t('table.startedAt')}</span>

// Replace:
<span className="font-medium">Seats</span>

// With:
<span className="font-medium">{t('table.seats')}</span>

// Replace:
Take away

// With:
{t('table.takeaway')}

// Replace:
Preview

// With:
{t('table.preview')}

// Replace:
Print

// With:
{t('table.print')}

// Replace:
Printing...

// With:
{t('table.printing')}

// Replace:
Tap to start a new dine-in order

// With:
{t('table.tapToStart')}

// Replace:
Available

// With:
{t('table.available')}

// Replace:
Occupied

// With:
{t('table.occupied')}
```

## Complete Example Section

### Before:
```tsx
{isOccupied ? (
  <div className="flex gap-2 pt-3 mt-3 border-t border-amber-200">
    <button
      onClick={(event) => handlePreviewTable(table, event)}
      className="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded bg-white hover:bg-amber-100 transition"
    >
      <Eye className="w-3 h-3" />
      Preview
    </button>
    <button
      onClick={(event) => handlePrintTable(table, event)}
      disabled={printingTable === table.name}
      className="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded bg-white hover:bg-amber-100 transition disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {printingTable === table.name ? (
        <>
          <Loader2 className="w-3 h-3 animate-spin" />
          Printing...
        </>
      ) : (
        <>
          <Printer className="w-3 h-3" />
          Print
        </>
      )}
    </button>
  </div>
) : (
  <p className="text-sm text-gray-500">Tap to start a new dine-in order</p>
)}
```

### After:
```tsx
{isOccupied ? (
  <div className="flex gap-2 pt-3 mt-3 border-t border-amber-200">
    <button
      onClick={(event) => handlePreviewTable(table, event)}
      className="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded bg-white hover:bg-amber-100 transition"
    >
      <Eye className="w-3 h-3" />
      {t('table.preview')}
    </button>
    <button
      onClick={(event) => handlePrintTable(table, event)}
      disabled={printingTable === table.name}
      className="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded bg-white hover:bg-amber-100 transition disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {printingTable === table.name ? (
        <>
          <Loader2 className="w-3 h-3 animate-spin" />
          {t('table.printing')}
        </>
      ) : (
        <>
          <Printer className="w-3 h-3" />
          {t('table.print')}
        </>
      )}
    </button>
  </div>
) : (
  <p className="text-sm text-gray-500">{t('table.tapToStart')}</p>
)}
```

## All Translation Keys Already Available

All these keys are already defined in the translation files:

### From `/pos/src/i18n/locales/en.json`:
```json
"table": {
  "title": "Tables",
  "available": "Available",
  "occupied": "Occupied",
  "room": "Room",
  "seats": "Seats",
  "startedAt": "Started at",
  "takeaway": "Take away",
  "preview": "Preview",
  "print": "Print",
  "printing": "Printing...",
  "tapToStart": "Tap to start a new dine-in order",
  "noRooms": "No rooms found for this branch",
  "noTables": "No tables found for this room",
  "loadingRooms": "Loading rooms...",
  "loadingTables": "Loading tables...",
  "failedToLoadRooms": "Failed to load rooms",
  "failedToLoadTables": "Failed to load tables",
  "noBillActivity": "No bill activity yet"
}
```

### From `/pos/src/i18n/locales/ar.json`:
```json
"table": {
  "title": "الطاولات",
  "available": "متاحة",
  "occupied": "محجوزة",
  "room": "القاعة",
  "seats": "المقاعد",
  "startedAt": "بدأت في",
  "takeaway": "طلبات خارجية",
  "preview": "معاينة",
  "print": "طباعة",
  "printing": "جاري الطباعة...",
  "tapToStart": "اضغط لبدء طلب جديد للطعام في المطعم",
  "noRooms": "لا توجد قاعات لهذا الفرع",
  "noTables": "لا توجد طاولات في هذه القاعة",
  "loadingRooms": "جاري تحميل القاعات...",
  "loadingTables": "جاري تحميل الطاولات...",
  "failedToLoadRooms": "فشل تحميل القاعات",
  "failedToLoadTables": "فشل تحميل الطاولات",
  "noBillActivity": "لا يوجد نشاط فاتورة حتى الآن"
}
```

## Testing

After updating Table.tsx:

1. Save the file
2. Reload the POS application
3. Click the language switcher in the header
4. Verify that:
   - All table labels change to Arabic
   - The layout switches to RTL (right-to-left)
   - Buttons like "Preview" and "Print" show Arabic text
   - Status badges show Arabic text

## Tips

1. **Use Find & Replace**: In VS Code, use Ctrl+H to find and replace multiple occurrences
2. **One at a time**: Replace one string at a time to avoid mistakes
3. **Test frequently**: Save and test after each section you update
4. **Check both languages**: Make sure it works in both English and Arabic

## Common Patterns

### Pattern 1: Simple Text
```tsx
// Before
<span>Available</span>

// After
<span>{t('table.available')}</span>
```

### Pattern 2: Conditional Text
```tsx
// Before
{isOccupied ? 'Occupied' : 'Available'}

// After
{isOccupied ? t('table.occupied') : t('table.available')}
```

### Pattern 3: Error Messages
```tsx
// Before
showToast.error('Failed to load tables');

// After
showToast.error(t('table.failedToLoadTables'));
```

### Pattern 4: Spinner Messages
```tsx
// Before
<Spinner message="Loading tables..." />

// After
<Spinner message={t('table.loadingTables')} />
```

## Apply Same Process to Other Components

Use this exact same process for all other components:
1. Import `useTranslation`
2. Call `const { t } = useTranslation()`
3. Replace hardcoded strings with `t('key.path')`
4. Test in both languages

The translation keys are already prepared for most common scenarios!
