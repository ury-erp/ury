# URY Dashboard — Makefile
# Convenience commands for development and production

.PHONY: help dev build test test-unit test-e2e docker-build docker-up docker-down docker-logs \
        dev-up dev-down dev-logs dev-ps dev-restart dev-setup storybook

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Development ──────────────────────────────────────────
dev: ## Start development server
	npm run dev

build: ## Build Next.js for production
	npm run build

# ── Testing ──────────────────────────────────────────────
test: test-unit test-e2e ## Run all tests

test-unit: ## Run Vitest unit tests
	npm test

test-watch: ## Run Vitest in watch mode
	npm run test:watch

test-e2e: ## Run Playwright E2E tests
	npm run test:e2e

test-e2e-ui: ## Run Playwright E2E tests with UI
	npm run test:e2e:ui

# ── Docker Production ────────────────────────────────────
docker-build: ## Build Docker image
	docker build -t ury-dashboard:latest .

docker-up: ## Start production stack (Caddy + Dashboard)
	docker compose -f docker-compose.prod.yml up -d

docker-down: ## Stop production stack
	docker compose -f docker-compose.prod.yml down

docker-logs: ## Follow dashboard logs
	docker compose -f docker-compose.prod.yml logs -f dashboard

docker-restart: ## Restart production stack
	docker compose -f docker-compose.prod.yml restart

docker-ps: ## Show running containers
	docker compose -f docker-compose.prod.yml ps

# ── Docker Development ───────────────────────────────────
dev-up: ## Start dev stack (Dashboard + Postgres + Adminer + Redis + Realtime)
	docker compose -f docker-compose.dev.yml up -d

dev-down: ## Stop dev stack
	docker compose -f docker-compose.dev.yml down

dev-logs: ## Follow dev dashboard logs
	docker compose -f docker-compose.dev.yml logs -f dashboard

dev-ps: ## Show dev containers
	docker compose -f docker-compose.dev.yml ps

dev-restart: ## Restart dev stack
	docker compose -f docker-compose.dev.yml restart

dev-setup: ## First-time dev setup (create .env + start stack)
	@if [ ! -f .env ]; then cp .env.dev .env && echo "Created .env from .env.dev"; fi
	docker compose -f docker-compose.dev.yml up -d --build
	@echo "Waiting for dashboard to be ready..."
	@sleep 10
	docker compose -f docker-compose.dev.yml exec dashboard npx prisma db push
	@echo "✓ Dev environment ready at http://localhost:3000"

# ── Storybook ────────────────────────────────────────────
storybook: ## Start Storybook component docs
	npm run storybook

# ── Setup ────────────────────────────────────────────────
setup: ## First-time setup (install deps + build)
	npm ci
	npm run build
	@echo "✓ Setup complete. Run 'make dev' to start."

lint: ## Run ESLint
	npm run lint

# ── Branch Protection ────────────────────────────────────
protect: ## Apply branch protection rules to GitHub
	@echo "Applying branch protection rules..."
	GITHUB_TOKEN=$$GITHUB_TOKEN REPO=$$REPO node scripts/apply-branch-protection.mjs

# ── Fork PR ──────────────────────────────────────────────
fork-pr: ## Create PR from fork to upstream
	bash scripts/create-upstream-pr.sh
