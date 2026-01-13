# Arabic Language Support Guide for URY POS

## Overview
Arabic language support has been successfully added to the URY POS application. The implementation includes:
- ✅ i18next internationalization library
- ✅ English and Arabic translation files
- ✅ RTL (Right-to-Left) support for Arabic
- ✅ Language switcher component in the header
- ✅ Automatic direction switching

## Usage

### 1. Switching Languages
Users can switch between English and Arabic by clicking the language button in the header (next to the user menu).
- Shows "عربي" when in English mode
- Shows "EN" when in Arabic mode

### 2. How to Use Translations in Components

#### Basic Usage
```tsx
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation();

  return (
    <div>
      <h1>{t('common.search')}</h1>
      <p>{t('table.available')}</p>
    </div>
  );
}
```

#### With Variables
```tsx
const { t } = useTranslation();

// Translation: "Minimum length is {{min}} characters"
<p>{t('validation.minLength', { min: 5 })}</p>
```

### 3. Translation Keys Structure

The translations are organized in a hierarchical structure:

```
common/          - Common words (search, save, cancel, etc.)
header/          - Header component strings
table/           - Table-related strings
menu/            - Menu-related strings
order/           - Order management strings
customer/        - Customer-related strings
payment/         - Payment-related strings
pos/             - POS opening/closing strings
kot/             - Kitchen Order Ticket strings
messages/        - Success and error messages
  success/       - Success messages
  error/         - Error messages
validation/      - Form validation messages
```

### 4. RTL (Right-to-Left) Support

The application automatically switches to RTL layout when Arabic is selected. The CSS includes:
- Automatic text direction change
- Reversed flex layouts
- Mirrored spacing (margins and paddings)
- Flipped border radius

### 5. Adding New Translations

To add new translations:

1. Add the key to `/pos/src/i18n/locales/en.json`:
```json
{
  "mySection": {
    "myKey": "My English Text"
  }
}
```

2. Add the Arabic translation to `/pos/src/i18n/locales/ar.json`:
```json
{
  "mySection": {
    "myKey": "النص العربي الخاص بي"
  }
}
```

3. Use it in your component:
```tsx
const { t } = useTranslation();
<span>{t('mySection.myKey')}</span>
```

### 6. Example: Converting an Existing Component

**Before (hardcoded English):**
```tsx
function TableCard() {
  return (
    <div>
      <h2>Tables</h2>
      <button>Available</button>
      <p>No tables found</p>
    </div>
  );
}
```

**After (with translations):**
```tsx
import { useTranslation } from 'react-i18next';

function TableCard() {
  const { t } = useTranslation();

  return (
    <div>
      <h2>{t('table.title')}</h2>
      <button>{t('table.available')}</button>
      <p>{t('table.noTables')}</p>
    </div>
  );
}
```

### 7. Components Updated

The following components have been updated with translation support:
- ✅ `Header.tsx` - All menu items and search placeholders
- ✅ `LanguageSwitcher.tsx` - New component for language switching
- ⚠️ Other components - Need to be updated (see below)

### 8. Components That Need Translation Updates

You still need to update the following components to use the `t()` function:

1. **Table.tsx** - Update all hardcoded strings like "Available", "Occupied", "Preview", "Print", etc.
2. **SearchBar.tsx** - Update placeholder text
3. **MenuList.tsx** - Update menu-related strings
4. **OrderPanel.tsx** - Update order management strings
5. **CustomerSelect.tsx** - Update customer-related strings
6. **ProductDialog.tsx** - Update dialog content
7. **Sidebar.tsx** - Update sidebar labels
8. **All other components** - Replace hardcoded English text with `t('key.path')`

### 9. Quick Reference for Common Translations

| English | Arabic | Key |
|---------|--------|-----|
| Search | بحث | `common.search` |
| Save | حفظ | `common.save` |
| Cancel | إلغاء | `common.cancel` |
| Available | متاحة | `table.available` |
| Occupied | محجوزة | `table.occupied` |
| Print | طباعة | `common.print` |
| Customer | العميل | `order.customer` |
| Order | طلب | `order.newOrder` |
| Payment | الدفع | `payment.paymentMethod` |

### 10. Testing

To test the Arabic language support:

1. Run the development server:
   ```bash
   cd /home/ah_hammadi/golive-bench/apps/ury/pos
   yarn dev
   ```

2. Open the POS in your browser
3. Click the language switcher button (عربي/EN) in the header
4. Verify that:
   - Text changes to Arabic
   - Layout switches to RTL
   - All translated components display correctly

### 11. Building for Production

Before building for production:

1. Ensure all components use translation keys
2. Build the application:
   ```bash
   cd /home/ah_hammadi/golive-bench/apps/ury/pos
   yarn build
   ```

3. The built files will be in `/pos/dist/`

### 12. Troubleshooting

**Problem:** Text not translating
- **Solution:** Make sure you imported `useTranslation` and called `t()` function

**Problem:** RTL layout not working
- **Solution:** Check that the CSS file includes RTL rules and `dir` attribute is set on `<html>`

**Problem:** Missing translation key error
- **Solution:** Add the missing key to both `en.json` and `ar.json` files

### 13. Language Persistence

The selected language is automatically saved to browser's localStorage and will persist across sessions.

## Next Steps

To complete the Arabic translation:

1. Go through each component file in `/pos/src/components/`
2. Find all hardcoded English text
3. Replace with `t('appropriate.key')` calls
4. Add any missing translations to both language files
5. Test thoroughly in both languages

## Support

For questions or issues with translations, refer to:
- i18next documentation: https://www.i18next.com/
- react-i18next documentation: https://react.i18next.com/
