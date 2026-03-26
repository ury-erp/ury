# @ury/menu

Menu fetching, display, and filtering for URY applications.

## Installation

```bash
yarn add @ury/menu
```

## Usage

```tsx
import { usePublicMenu, useRestaurantInfo, useTableToken } from '@ury/menu';

function MenuPage({ restaurantSlug }: { restaurantSlug: string }) {
  const { info } = useRestaurantInfo(restaurantSlug);
  const { menu, loading } = usePublicMenu(info?.name || '');

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <h1>{info?.restaurant_name}</h1>
      {menu.map(item => (
        <div key={item.item}>
          <h3>{item.item_name}</h3>
          <p>${item.rate}</p>
        </div>
      ))}
    </div>
  );
}
```

## Hooks

- `usePublicMenu(restaurant, orderType?)` - Fetch public menu
- `useRestaurantInfo(slug)` - Get restaurant details
- `useTableToken(token)` - Validate QR table token

## Part of URY

This package is part of the [URY](https://github.com/ury-erp/ury) restaurant ERP system.
