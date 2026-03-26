---
name: monorepo
description: NPM workspaces and monorepo structure for URY frontend applications. Use when adding packages, managing dependencies between apps, building frontend assets, or working with shared code across POS, QR ordering, online ordering, and kiosk applications.
category: frontend
---

# URY Monorepo Structure

NPM workspaces configuration for URY's multi-app frontend architecture.

## Key Files

| File | Purpose |
|------|---------|
| `package.json` (root) | Workspace definition, build scripts |
| `packages/config/` | `@ury/config` - Constants, doctypes, order types |
| `packages/ui/` | `@ury/ui` - React UI components |
| `packages/api-client/` | `@ury/api-client` - Frappe SDK wrapper |
| `packages/cart/` | `@ury/cart` - Cart state management |
| `packages/menu/` | `@ury/menu` - Menu display components |
| `packages/order/` | `@ury/order` - Order lifecycle management |
| `apps/pos/` | Staff POS v2 (React + TypeScript + Vite) |
| `apps/table-order/` | QR table ordering app |
| `apps/customer-order/` | Online ordering app |
| `apps/kiosk/` | Self-service kiosk app |

## How It Works

### Workspace Configuration

```json
// package.json (root)
{
  "private": true,
  "workspaces": [
    "packages/*",
    "apps/*"
  ],
  "scripts": {
    "ury-pos-install": "cd apps/pos && yarn install --check-files",
    "ury-pos-build": "cd apps/pos && yarn build",
    "ury-mosaic-install": "cd URYMosaic && yarn install --check-files",
    "ury-mosaic-build": "cd URYMosaic && yarn build",
    "postinstall": "yarn ury-pos-install && yarn ury-mosaic-install && ...",
    "build": "yarn ury-pos-build && yarn ury-mosaic-build && ...",
    "build:packages": "npm run build --workspaces --if-present"
  }
}
```

### Package Structure

```
packages/
├── config/               # @ury/config
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       └── index.ts
├── ui/                   # @ury/ui
│   ├── package.json
│   └── src/
│       ├── components/
│       └── index.ts
├── api-client/           # @ury/api-client
│   ├── package.json
│   └── src/
│       ├── client.ts
│       ├── types.ts
│       └── menu-api.ts
├── cart/                 # @ury/cart
│   ├── package.json
│   └── src/
│       └── store.ts
├── menu/                 # @ury/menu
└── order/                # @ury/order
```

### Creating a New Package

```bash
# 1. Create package directory
mkdir -p packages/my-package/src

# 2. Create package.json
cd packages/my-package
cat > package.json << 'EOF'
{
  "name": "@ury/my-package",
  "version": "0.0.1",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {},
  "devDependencies": {
    "typescript": "~5.7.2"
  }
}
EOF

# 3. Create tsconfig.json (copy from existing package)
cp ../config/tsconfig.json .

# 4. Create src/index.ts
touch src/index.ts

# 5. Install dependencies
yarn install
```

### Using Packages in Apps

```json
// apps/pos/package.json
{
  "dependencies": {
    "@ury/config": "*",
    "@ury/ui": "*",
    "@ury/api-client": "*",
    "@ury/cart": "*"
  }
}
```

```typescript
// apps/pos/src/components/Menu.tsx
import { Button, Card } from '@ury/ui';
import { useCartStore } from '@ury/cart';
import { getPublicMenu } from '@ury/api-client';
import { ORDER_TYPES } from '@ury/config';
```

### Package Build Output

```typescript
// vite.config.ts (in apps/pos/)
export default defineConfig({
  build: {
    outDir: "../../ury/public/pos",  // Relative to apps/pos/
  }
})
```

### Build Commands

```bash
# Install all dependencies
yarn install

# Build all packages
yarn build:packages

# Build specific app
yarn ury-pos-build

# Build everything
yarn build

# Frappe asset build
bench build --app ury
```

## Extension Points

- **New shared package**: Create in `packages/<name>/`, add to root `package.json` workspaces if needed
- **New app**: Create in `apps/<name>/`, add install/build scripts to root `package.json`
- **Cross-package dependency**: Add to `dependencies` in package.json with `"*"` version
- **Package export**: Define in `exports` field of package.json for clean imports

## Dependencies

- Node.js + Yarn
- TypeScript (5.7.2)
- Vite (for apps)

## Gotchas

- **Build path**: Apps build to `ury/public/<app-name>/` for Frappe to serve
- **Workspace install**: Run `yarn install` from root, not individual packages
- **Package changes**: Rebuild packages after changes: `yarn build:packages`
- **Import paths**: Use `@ury/<package>` imports, not relative paths across packages
- **TypeScript**: Each package needs its own `tsconfig.json`
- **Version pinning**: Use `"*"` for internal packages to always use latest
