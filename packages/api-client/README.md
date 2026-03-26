# @ury/api-client

Frappe SDK wrapper and typed API functions for URY applications.

## Installation

```bash
yarn add @ury/api-client
```

## Usage

```typescript
import { call, db, auth } from '@ury/api-client';
import { getPublicMenu, getRestaurantMenu } from '@ury/api-client';

// Use Frappe SDK directly
const user = await auth.getLoggedInUser();

// Use typed API functions
const menu = await getPublicMenu('my-restaurant', 'Dine In');
```

## API Functions

### Menu API

```typescript
getPublicMenu(restaurant: string, orderType?: string): Promise<MenuItemAPI[]>
getRestaurantMenu(posProfile: string, room?: string, orderType?: string): Promise<MenuItemAPI[]>
getAggregatorMenu(aggregator: string): Promise<MenuItemAPI[]>
```

### Auth API

```typescript
login(username: string, password: string): Promise<void>
logout(): Promise<void>
getCurrentUser(): Promise<string | null>
isAuthenticated(): Promise<boolean>
```

## Configuration

Set the Frappe base URL in your environment:

```env
VITE_FRAPPE_BASE_URL=https://your-frappe-site.com
```

## Part of URY

This package is part of the [URY](https://github.com/ury-erp/ury) restaurant ERP system.
