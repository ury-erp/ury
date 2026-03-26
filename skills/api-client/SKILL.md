---
title: URY API Client
category: patterns
description: Frappe SDK wrapper (@ury/api-client) providing typed API access to Frappe backend
usage: |
  Use for all backend communication in URY frontend applications.
  Import from @ury/api-client instead of direct frappe-js-sdk usage.
---

# URY API Client

The `@ury/api-client` package provides a centralized, pre-configured Frappe SDK client for all URY frontend applications. It handles authentication, database operations, and remote procedure calls (RPC) to the Frappe backend.

## Key Files

| File | Purpose |
|------|---------|
| `packages/api-client/src/client.ts` | Main SDK client configuration and exports |
| `packages/api-client/src/index.ts` | Package exports (add API functions here) |
| `packages/api-client/package.json` | Package metadata and dependencies |

## Quick Start

```typescript
// Import the pre-configured clients
import { call, db, auth, file } from '@ury/api-client';

// Call a whitelisted API method
const result = await call.get('ury.ury_customer.api.get_public_menu', {
  restaurant: 'my-restaurant'
});

// Query a DocType
const invoices = await db.getDocList('POS Invoice', {
  fields: ['name', 'grand_total'],
  filters: [['status', '=', 'Paid']]
});
```

## How It Works

### Client Initialization

```typescript
import { FrappeApp } from "frappe-js-sdk";

// Base URL from environment or window location
const baseUrl = import.meta.env?.VITE_FRAPPE_BASE_URL || 
                (typeof window !== 'undefined' ? window.location.origin : '');

// Create singleton FrappeApp instance
export const frappeApp = new FrappeApp(baseUrl);

// Export individual API clients for convenience
export const call = frappeApp.call();    // RPC calls
export const db = frappeApp.db();        // Document operations
export const auth = frappeApp.auth();    // Authentication
export const file = frappeApp.file();    // File uploads
```

### API Clients Reference

| Client | Purpose | Key Methods |
|--------|---------|-------------|
| `call` | Whitelisted method invocation | `get(method, params)`, `post(method, data)` |
| `db` | Document CRUD operations | `getDoc(doctype, name)`, `getDocList(doctype, opts)`, `createDoc(doctype, data)`, `updateDoc(doctype, name, data)`, `deleteDoc(doctype, name)` |
| `auth` | Session management | `login(username, password)`, `logout()`, `getLoggedInUser()` |
| `file` | File upload/download | `uploadFile(file, opts)`, `getFileURL(fileURL)` |

## Usage Patterns

### Calling Whitelisted Methods

```typescript
import { call } from '@ury/api-client';

// GET request for simple params
const menu = await call.get('ury.ury_customer.api.get_public_menu', {
  restaurant: 'my-restaurant',
  order_type: 'Dine In'
});

// POST request for complex data
const order = await call.post('ury.ury_customer.api.create_customer_order', {
  restaurant: 'my-restaurant',
  table: 'Table 1',
  items: [{item: 'Burger', qty: 2}]
});
```

### Document CRUD Operations

```typescript
import { db } from '@ury/api-client';

// Get single document
const restaurant = await db.getDoc('URY Restaurant', 'Main Branch');

// List documents with filters
const tables = await db.getDocList('URY Table', {
  fields: ['name', 'no_of_seats', 'occupied'],
  filters: [
    ['restaurant', '=', 'Main Branch'],
    ['occupied', '=', false]
  ],
  limit: 50
});

// Create document
const newOrder = await db.createDoc('POS Invoice', {
  customer: 'Guest',
  items: [{item_code: 'Burger', qty: 1, rate: 10}]
});

// Update document
await db.updateDoc('POS Invoice', 'POS-INV-001', {
  fulfillment_status: 'Preparing'
});

// Delete document
await db.deleteDoc('POS Invoice', 'POS-INV-001');
```

### Authentication Flow

```typescript
import { auth } from '@ury/api-client';

// Login
await auth.login('user@example.com', 'password');

// Check current user
const user = await auth.getLoggedInUser();
// Returns: 'user@example.com' or null

// Logout
await auth.logout();
```

### File Uploads

```typescript
import { file } from '@ury/api-client';

// Upload file
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const uploadedFile = await file.uploadFile(fileInput.files[0], {
  doctype: 'URY Restaurant',
  docname: 'Main Branch',
  fieldname: 'logo',
  is_private: 0
});

// Get file URL
const url = file.getFileURL(uploadedFile.file_url);
```

## Extension Points

### Adding Typed API Wrappers

Create typed convenience functions in `packages/api-client/src/`:

```typescript
// packages/api-client/src/restaurant.ts
import { call } from './client';
import type { Restaurant, MenuItem } from '@ury/config';

export async function getRestaurantBySlug(slug: string): Promise<Restaurant> {
  const response = await call.get('ury.ury_customer.api.get_restaurant_info', { slug });
  return response.message;
}

export async function getMenu(restaurant: string, orderType?: string): Promise<MenuItem[]> {
  const response = await call.get('ury.ury_customer.api.get_public_menu', {
    restaurant,
    order_type: orderType
  });
  return response.message;
}
```

Export from index:
```typescript
// packages/api-client/src/index.ts
export * from './client';
export * from './restaurant';
```

### Adding Error Handling Middleware

```typescript
// packages/api-client/src/client.ts
import { FrappeError } from 'frappe-js-sdk';

export async function safeCall<T>(
  method: string, 
  params?: Record<string, unknown>
): Promise<{ data?: T; error?: FrappeError }> {
  try {
    const result = await call.get(method, params);
    return { data: result.message as T };
  } catch (error) {
    return { error: error as FrappeError };
  }
}
```

### Environment Configuration

```typescript
// Different base URLs per environment
const baseUrl = (() => {
  if (import.meta.env.VITE_FRAPPE_BASE_URL) {
    return import.meta.env.VITE_FRAPPE_BASE_URL;
  }
  if (import.meta.env.DEV) {
    return 'http://localhost:8080';
  }
  return window.location.origin;
})();
```

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `frappe-js-sdk` | ^1.10.0 | Core Frappe SDK |
| `typescript` | ~5.7.2 | Type checking |
| `@types/node` | ^24.0.10 | Node.js types |

## Gotchas

### Vite Environment Variables
In Vite-based apps (apps/pos uses Vite), env vars must be prefixed with `VITE_`:
```bash
VITE_FRAPPE_BASE_URL=http://localhost:8080
```

### SSR Compatibility
The client checks `typeof window` for server-side rendering safety:
```typescript
(typeof window !== 'undefined' ? window.location.origin : '')
```

### Response Structure
Frappe API responses always wrap data in `message`:
```typescript
const response = await call.get('method.name');
const actualData = response.message; // Not response directly
```

### CSRF Token Handling
`frappe-js-sdk` automatically handles CSRF tokens for POST requests. No manual intervention needed.

### Session Persistence
Sessions are cookie-based. The SDK doesn't store tokens - relies on Frappe's session cookie.

### Error Format
Frappe errors have specific structure:
```typescript
try {
  await call.get('method.name');
} catch (error) {
  // error.httpStatus - HTTP status code
  // error.message - Error message from server
  // error.exc - Stack trace (if debug mode)
}
```

### Guest Access
For guest APIs, no login needed but method must be `@frappe.whitelist(allow_guest=True)`.

### CORS in Development
When developing locally, ensure Frappe has CORS configured:
```python
# site_config.json
"allow_cors": "*"
```

### File Upload Size Limits
Frappe default file upload limit is 10MB. Configure in `site_config.json`:
```json
{
  "max_file_size": 52428800
}
```

### getDocList Limit
Default limit is 20. Always specify limit for larger lists:
```typescript
await db.getDocList('POS Invoice', { limit: 1000 })
```

### Date Format
Frappe returns dates as strings: `"2025-03-26 10:30:00"`. Parse manually:
```typescript
const date = new Date(doc.creation);
```
