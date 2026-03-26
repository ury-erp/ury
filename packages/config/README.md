# @ury/config

Shared configuration and constants for URY applications.

## Installation

```bash
yarn add @ury/config
```

## Usage

```typescript
import { DOCTYPES } from '@ury/config';

// Use DocType constants
const profile = await db.getDoc(DOCTYPES.POS_PROFILE, 'profile-name');
```

```typescript
import { ORDER_TYPES, DEFAULT_ORDER_TYPE, FULFILLMENT_STATUSES } from '@ury/config';

// Use order type constants
const orderType = ORDER_TYPES.find(t => t.value === 'Dine In');

// Use fulfillment statuses
const status = FULFILLMENT_STATUSES.find(s => s.value === 'Ready');
```

## Contents

- **doctypes.ts** - DocType name constants
- **order-types.ts** - Order types, sources, and fulfillment statuses

## Part of URY

This package is part of the [URY](https://github.com/ury-erp/ury) restaurant ERP system.
