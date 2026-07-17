# Contributing to URY

Thank you for your interest in contributing to URY! This guide covers everything you need to get started.

## Quick Start

### Prerequisites

- **Node.js** 20+ (LTS recommended)
- **Yarn** 1.22+ (classic)
- **Docker** & Docker Compose (optional, for containerized dev)
- **Python** 3.10+ (for Frappe backend)

### Setup with Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/ury-erp/ury.git
cd ury

# Start the full dev stack
make dev-setup

# View logs
make dev-logs
```

This starts:
- **URY Dashboard** on http://localhost:3000
- **PostgreSQL 16** on localhost:5432
- **Redis 7** on localhost:6379
- **Adminer** (DB GUI) on http://localhost:8080
- **URY Realtime** (WebSocket) on localhost:4000

### Setup without Docker

```bash
# Install dependencies
yarn install

# Build all workspaces
yarn build

# Start development server
make dev
```

## Repository Structure

```
ury/
├── packages/ui/        # @ury/ui — Shared UI component library
│   └── src/
│       ├── components/  # Button, Card, Badge, Input, etc.
│       ├── styles/      # Theme CSS, Tailwind preset
│       └── lib/         # Utilities (cn, etc.)
├── pos/                 # POS v2 — React POS application
├── frontend/            # Frontend — Main Next.js dashboard
├── ury/                 # Frappe backend app
├── urypos/              # Legacy POS (Frappe)
├── URYMosaic/           # Mosaic dashboard widget
├── mini-services/       # Microservices (WebSocket realtime)
├── .github/             # CI/CD, branch protection, CODEOWNERS
├── .storybook/          # Storybook configuration
└── scripts/             # Dev utility scripts
```

## Development Workflow

### Branch Naming

| Type | Format | Example |
|------|--------|---------|
| Feature | `feat/<description>` | `feat/kitchen-display` |
| Bug fix | `fix/<description>` | `fix/order-total-calc` |
| Infrastructure | `infra/<description>` | `infra/ci-pipeline` |
| POS | `pos/<description>` | `pos/thermal-printing` |

### Creating a Pull Request

1. Create a feature branch from `develop`
2. Make your changes with clear, descriptive commits
3. Push to your fork and create a PR to `upstream/develop`
4. Ensure CI checks pass (lint, type-check, tests, build)
5. Get the required approvals (1 for develop, 2 for main)

#### Fork Contributors

```bash
# Use the helper script
make fork-pr

# Or manually with GitHub CLI
bash scripts/create-upstream-pr.sh feature/my-change
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(pos): add thermal printer support
fix(dashboard): resolve order total rounding error
docs: update CONTRIBUTING.md
chore(deps): bump react to 19.1
```

## Code Quality

### Linting

```bash
make lint
# or
yarn lint
```

### Type Checking

```bash
yarn --cwd packages/ui typecheck
```

### Testing

```bash
make test
# or
yarn test
```

### Storybook

```bash
# Start Storybook dev server
make storybook

# Build static Storybook
make build-storybook
```

Storybook runs on http://localhost:6006 with all `@ury/ui` component stories.

## Component Development

When adding new components to `@ury/ui`:

1. Create the component in `packages/ui/src/components/`
2. Add a corresponding `.stories.tsx` file in `packages/ui/src/components/__stories__/`
3. Use CVA (class-variance-authority) for variant management
4. Follow existing patterns (see Button, Card, Badge for reference)
5. Export from `packages/ui/src/index.ts`

### Story Example

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MyComponent } from "../my-component";

const meta: Meta<typeof MyComponent> = {
  title: "UI/MyComponent",
  component: MyComponent,
  parameters: { layout: "centered" },
};

export default meta;
type Story = StoryObj<typeof MyComponent>;

export const Default: Story = {
  args: { children: "Hello" },
};
```

## Branch Protection

| Branch | Approvals | Code Owners | Linear History | Enforce Admins |
|--------|-----------|-------------|----------------|----------------|
| `main` | 2 | Required | Yes | Yes |
| `develop` | 1 | Not required | No | No |

## Need Help?

- Open a [GitHub Issue](https://github.com/ury-erp/ury/issues)
- Check existing [Pull Requests](https://github.com/ury-erp/ury/pulls)
- Refer to `AGENTS.MD` and `FEATURES.md` for project context
