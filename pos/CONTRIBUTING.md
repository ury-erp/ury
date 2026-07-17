# Contributing to URY POS

Thank you for your interest in contributing to URY POS! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js 18+
- npm or yarn

### Quick Start

```bash
cd pos
npm install       # Installs dependencies + Husky git hooks
cp .env.example .env
# Edit .env with your Frappe backend URL or enable MSW for offline development
npm run dev
```

Husky pre-commit hooks are installed automatically during `npm install`. They run ESLint + Prettier on staged files and validate commit message format.

### Running Without a Backend (MSW Mode)

Set `VITE_MSW_ENABLED=true` in `.env` to run the POS with mock data. No Frappe backend needed.

```bash
# .env
VITE_MSW_ENABLED=true
VITE_FRAPPE_BASE_URL=
```

## Development Workflow

1. **Create a branch** from `develop`: `git checkout -b feature/your-feature`
2. **Make changes** and write tests
3. **Run checks** before committing:
   ```bash
   npm run check-all
   ```
   This runs type-check, lint, test, and build.
4. **Commit** with descriptive messages following [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat: add new payment method`
   - `fix: correct tax calculation in cart`
   - `docs: update API integration guide`
   - `test: add coverage for order sync`
   - `refactor: extract shared cart logic`

   The commit-msg hook validates this format automatically. If you need to bypass it (e.g., for merge commits), use `git commit --no-verify`.

5. **Push** and open a Pull Request against `develop`

## Code Quality

### Pre-commit Hooks

[Husky](https://typicode.github.io/husky/) + [lint-staged](https://github.com/okonet/lint-staged) enforce code quality automatically:

- **Pre-commit**: ESLint (`--fix`) + Prettier (`--write`) on staged `.ts`/`.tsx` files
- **Pre-commit**: Prettier on staged `.json`/`.md`/`.yml`/`.css` files
- **Commit-msg**: Validates Conventional Commits format

### Prettier

Formatting is enforced by Prettier (`.prettierrc`):

- Single quotes, trailing commas, 100 character line width, 2-space indentation
- Run `npm run format` to format all files
- Run `npm run format:check` to verify formatting in CI

### Coverage Thresholds

Vitest enforces minimum coverage thresholds:

| Metric     | Minimum |
| ---------- | ------- |
| Lines      | 60%     |
| Statements | 60%     |
| Branches   | 50%     |
| Functions  | 55%     |

Run `npm run test:coverage` to check locally. The CI pipeline will fail if thresholds are not met.

## Code Standards

### TypeScript

- Strict mode enabled — no `any` types without justification
- Prefer interfaces for object shapes, types for unions/intersections
- Use proper generics for API response types

### React

- Functional components with hooks only
- Keep components focused — extract when they grow beyond 150 lines
- Use Zustand for state management, not prop drilling or context
- Use `data-testid` attributes for E2E test selectors

### API Layer

- All API calls go through `src/lib/frappe-sdk-retry.ts`
- Use `call.get()` / `call.post()` — never raw axios
- Use `fetchWithDedup()` from `api-dedup.ts` for cacheable reads
- Call `invalidateCache()` after mutations

### Internationalization

- All user-visible strings must use `t('key')` from `src/i18n/`
- Add translations to all locale files: `en.json`, `fr.json`, `ar.json`, `sl.json`
- Use English keys in code (e.g., `t('footer.pos')`)

## Testing

### Unit Tests (Vitest)

```bash
npm test              # Run once
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
```

- Test files go next to the source file: `Component.tsx` → `Component.test.tsx`
- Use MSW server for API-dependent tests — it's configured in `src/test/setup.ts`
- Use `beforeEach(() => invalidateCache())` when testing API handlers
- Mock external dependencies (i18n, frappe-sdk) at the module level

### E2E Tests (Playwright)

```bash
VITE_MSW_ENABLED=true npx playwright test
```

- E2E tests use MSW service worker in the browser
- The `data-msw-ready` attribute signals MSW is active
- Always use the `loadPage` helper pattern:
  ```typescript
  async function loadPage(page, path = '/') {
    await page.goto(path);
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-msw-ready') === 'true',
      { timeout: 20000 },
    );
    await page.waitForTimeout(3000);
  }
  ```
- Use `data-testid` selectors when possible, text content as fallback

### MSW Mocking

- **Fixtures**: `src/mocks/fixtures.ts` — add new domains here
- **Handlers**: `src/mocks/handlers.ts` — register new API endpoints here
- **Browser**: `src/mocks/browser.ts` — used in development
- **Server**: `src/mocks/server.ts` — used in Vitest

To add a new mock endpoint:

1. Add fixture data to `fixtures.ts`
2. Add handler in `handlers.ts` using `http.get()` / `http.post()`
3. For resource endpoints, use `buildResourceHandlers(doctype, handlers)`
4. Add tests in `msw-api.test.ts` to verify the handler

## Project Structure

```
src/
├── components/     # UI components
│   ├── ui/         # Reusable primitives (shadcn/ui)
│   ├── dashboard/  # Dashboard charts
│   └── ...
├── pages/          # Route-level pages
├── store/          # Zustand state (sliced architecture)
│   ├── slices/     # Individual store slices
│   └── *-store.ts  # Combined stores
├── lib/            # API layer, utilities, SDK wrappers
├── mocks/          # MSW fixtures, handlers, browser/server
├── i18n/           # Translations
├── data/           # Constants
└── test/           # Test setup
```

## Pull Request Checklist

- [ ] All checks pass (`npm run check-all`)
- [ ] New features have unit tests
- [ ] Coverage thresholds are met (`npm run test:coverage`)
- [ ] New API endpoints have MSW handlers and fixture data
- [ ] User-facing strings use `t()` for i18n
- [ ] No `any` types introduced without justification
- [ ] Code is formatted (`npm run format:check`)
- [ ] Commit messages follow Conventional Commits
- [ ] CHANGELOG.md updated (if applicable)

## License

By contributing, you agree that your contributions will be licensed under the GPL-3.0 License.
