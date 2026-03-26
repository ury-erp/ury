---
category: patterns
name: menu-hooks
description: Menu fetching React hooks (@ury/menu package)
version: 1.0.0
---

# Menu Hooks Skill

React hooks for fetching menu data, restaurant information, and validating table tokens in URY applications.

## Quick Start

```tsx
import { usePublicMenu, useRestaurantInfo, useTableToken } from '@ury/menu';

function MenuPage({ restaurantSlug, tableToken }) {
  // Fetch restaurant info
  const { info: restaurant, loading: loadingRestaurant } = useRestaurantInfo(restaurantSlug);
  
  // Fetch menu items
  const { menu, loading: loadingMenu } = usePublicMenu(
    restaurant?.name || '',
    'Dine In'
  );
  
  // Validate QR table token
  const { context: tableContext } = useTableToken(tableToken);

  if (loadingRestaurant || loadingMenu) return <Spinner />;

  return (
    <div>
      <h1>{restaurant?.restaurant_name}</h1>
      <MenuList items={menu} />
      {tableContext && <TableBadge table={tableContext.table_name} />}
    </div>
  );
}
```

## Hook API Reference

### usePublicMenu

Hook for fetching public menu items for a restaurant.

```tsx
const { menu, loading, error, refresh } = usePublicMenu(
  restaurant,     // Restaurant ID (required)
  orderType       // Optional: 'Dine In', 'Take Away', etc.
);
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `restaurant` | `string` | Restaurant ID (not slug) |
| `orderType` | `string \| undefined` | Filter by order type availability |

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| `menu` | `MenuItem[]` | Array of menu items |
| `loading` | `boolean` | True while fetching |
| `error` | `string \| null` | Error message if failed |
| `refresh` | `() => void` | Manual refresh function |

**MenuItem:**

```ts
{
  item: string;           // Item code
  item_name: string;      // Display name
  rate: number;           // Price
  item_image?: string;    // Image URL
  course?: string;        // Course category
  special_dish?: number;  // Flag for specials
  description?: string;   // Item description
}
```

### useRestaurantInfo

Hook for fetching restaurant details by slug.

```tsx
const { info, loading, error, refresh } = useRestaurantInfo(slug);
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `slug` | `string` | URL-friendly restaurant identifier |

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| `info` | `RestaurantInfo \| null` | Restaurant details |
| `loading` | `boolean` | Loading state |
| `error` | `string \| null` | Error message |
| `refresh` | `() => void` | Refresh function |

**RestaurantInfo:**

```ts
{
  name: string;                    // Restaurant ID
  restaurant_name: string;         // Display name
  branch?: string;                 // Branch name
  company?: string;                // Company ID
  active_menu?: string;            // Current menu ID
  default_tax_template?: string;   // Tax configuration
  slug?: string;                   // URL slug
  logo?: string;                   // Logo URL
  opening_hours?: {                // Weekly schedule
    [day: string]: {
      open: string;   // HH:mm format
      close: string;  // HH:mm format
    }
  };
  accepts_online_orders?: boolean;
}
```

### useTableToken

Hook for validating QR table tokens.

```tsx
const { context, loading, error, refresh } = useTableToken(token);
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `token` | `string \| null` | QR code token string |

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| `context` | `TableContext \| null` | Validated table context |
| `loading` | `boolean` | Validating state |
| `error` | `string \| null` | Validation error |
| `refresh` | `() => void` | Re-validate function |

**TableContext:**

```ts
{
  restaurant: string;        // Restaurant ID
  restaurant_name: string;   // Restaurant name
  table: string;             // Table ID
  table_name: string;        // Table display name
  room: string;              // Room/section ID
  menu: string;              // Menu ID for this table
  valid: boolean;            // Always true if returned
}
```

## How It Works

### Data Fetching Pattern

All menu hooks follow the same async pattern:

```tsx
const [data, setData] = useState<DataType>(defaultValue);
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

const fetchData = useCallback(async () => {
  if (!requiredParam) return;  // Guard for missing params
  setLoading(true);
  try {
    const result = await apiFunction(params);
    setData(result);
    setError(null);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed');
    setData(defaultValue);
  } finally {
    setLoading(false);
  }
}, [params]);

useEffect(() => {
  fetchData();
}, [fetchData]);

return { data, loading, error, refresh: fetchData };
```

### API Endpoints

| Hook | API Method | Frappe Endpoint |
|------|------------|-----------------|
| `usePublicMenu` | `get_public_menu` | `ury.ury_customer.api.get_public_menu` |
| `useRestaurantInfo` | `get_restaurant_info` | `ury.ury_customer.api.get_restaurant_info` |
| `useTableToken` | `validate_table_token` | `ury.ury_customer.api.validate_table_token` |

### Token Validation Flow

```
Scan QR Code
    ↓
Extract token from URL
    ↓
useTableToken(token)
    ↓
API validates token against URY Table
    ↓
Returns TableContext or error
```

### Restaurant Slug Resolution

```
URL: /order/burger-house-nyc
    ↓
useRestaurantInfo('burger-house-nyc')
    ↓
API looks up by ury_restaurant.slug
    ↓
Returns restaurant info + opening_hours
```

## Extension Points

### Adding a Menu Filter Hook

```tsx
// packages/menu/src/hooks.ts
export function useFilteredMenu(
  restaurant: string,
  filters: { course?: string; vegetarian?: boolean }
) {
  const { menu, loading, error, refresh } = usePublicMenu(restaurant);
  
  const filtered = useMemo(() => {
    return menu.filter(item => {
      if (filters.course && item.course !== filters.course) return false;
      // Add more filter logic
      return true;
    });
  }, [menu, filters]);
  
  return { menu: filtered, loading, error, refresh, total: menu.length };
}
```

### Adding Restaurant Search Hook

```tsx
// packages/menu/src/hooks.ts
export function useRestaurantSearch(query: string) {
  const [results, setResults] = useState<RestaurantInfo[]>([]);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    if (!query || query.length < 3) {
      setResults([]);
      return;
    }
    
    const search = async () => {
      setLoading(true);
      try {
        const response = await searchRestaurants(query);
        setResults(response);
      } finally {
        setLoading(false);
      }
    };
    
    const timeout = setTimeout(search, 300); // Debounce
    return () => clearTimeout(timeout);
  }, [query]);
  
  return { results, loading };
}
```

### Custom Hook for Table + Menu

```tsx
// Combine table validation with menu loading
export function useTableMenu(tableToken: string | null) {
  const table = useTableToken(tableToken);
  const menu = usePublicMenu(
    table.context?.restaurant || '',
    'Dine In'
  );
  
  return {
    table: table.context,
    menu: menu.menu,
    loading: table.loading || menu.loading,
    error: table.error || menu.error,
    refresh: () => {
      table.refresh();
      menu.refresh();
    },
  };
}
```

## Key Files

| File | Purpose |
|------|---------|
| `packages/menu/src/hooks.ts` | React hooks implementation |
| `packages/menu/src/menu-api.ts` | API client functions |
| `packages/menu/src/types.ts` | TypeScript interfaces |
| `packages/menu/package.json` | Package configuration |

## Dependencies

```json
{
  "dependencies": {
    "@ury/api-client": "workspace:*",
    "react": "^18.0.0"
  }
}
```

## Gotchas

### Empty String vs Null

Hooks handle empty strings differently than null:

```tsx
// This will trigger fetch with empty string (may error)
const { menu } = usePublicMenu(restaurantId || '');

// Guard prevents fetch until we have valid ID
const { menu } = usePublicMenu(restaurantId || '');
// Hook internally checks: if (!restaurant) return;
```

### Restaurant ID vs Slug

```tsx
// useRestaurantInfo takes SLUG (URL-friendly)
const { info } = useRestaurantInfo('my-restaurant');

// usePublicMenu takes ID (from RestaurantInfo.name)
const { menu } = usePublicMenu(info?.name || '');

// Don't confuse them!
const { menu } = usePublicMenu('my-restaurant'); // Wrong - this is slug, not ID
```

### Opening Hours Format

Opening hours use 24-hour format:

```ts
{
  monday: { open: "09:00", close: "22:00" },
  tuesday: { open: "09:00", close: "22:00" },
  // ...etc
}
```

### Table Token Validity

Tokens can expire or be regenerated:

```tsx
const { context, error } = useTableToken(token);

if (error) {
  // Token invalid - show "Please scan QR code again"
}

if (context && !context.valid) {
  // Token valid but table inactive
}
```

### Chaining Hooks

When hooks depend on each other, use conditional deps:

```tsx
// Good - menu waits for restaurant
const restaurant = useRestaurantInfo(slug);
const menu = usePublicMenu(restaurant.info?.name || '');

// Menu hook guards internally and won't fetch until name is valid
```

### Refreshing Multiple Hooks

```tsx
const restaurant = useRestaurantInfo(slug);
const menu = usePublicMenu(restaurant.info?.name || '');
const table = useTableToken(token);

const refreshAll = () => {
  restaurant.refresh();
  menu.refresh();
  table.refresh();
};
```

### Image URLs

Menu item images may be null or relative paths:

```tsx
// Always check and provide fallback
<img 
  src={item.item_image || '/placeholder-food.png'} 
  alt={item.item_name}
/>

// Image URLs may need Frappe base URL prepended
const imageUrl = item.item_image 
  ? `${frappeBaseUrl}${item.item_image}`
  : '/placeholder-food.png';
```
