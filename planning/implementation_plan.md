# URY Multi-App Architecture — Implementation Plan

> **Status**: Planning only — no code changes authorized. Each feature will be built separately after approval.

## Document Index

This plan is split across 6 detailed documents based on deep inspection of the [URY repository](https://github.com/ury-erp/ury).

| # | Document | Sections |
|---|----------|----------|
| 1 | [01_repository_understanding.md](file:///Users/safwan/.gemini/antigravity/brain/74c5f74a-1c4a-46e6-a78c-385bdf084255/01_repository_understanding.md) | Repo structure, all 3 frontend apps, backend API surface (every endpoint mapped), ordering flow sequence diagram, reusability assessment |
| 2 | [02_capability_and_reuse.md](file:///Users/safwan/.gemini/antigravity/brain/74c5f74a-1c4a-46e6-a78c-385bdf084255/02_capability_and_reuse.md) | Feature matrix across 5 target experiences, blockers per app, shared vs app-specific logic classification, package boundary recommendations |
| 3 | [03_architecture_and_app_model.md](file:///Users/safwan/.gemini/antigravity/brain/74c5f74a-1c4a-46e6-a78c-385bdf084255/03_architecture_and_app_model.md) | Architecture evaluation, recommended approach (monorepo + domain packages), auth model, deployment/build strategy, detailed app definitions for all 5 experiences |
| 4 | [04_refactor_api_domain.md](file:///Users/safwan/.gemini/antigravity/brain/74c5f74a-1c4a-46e6-a78c-385bdf084255/04_refactor_api_domain.md) | Code refactor plan, API readiness (all required new endpoints with signatures), domain model extensions (new fields + doctypes), payment gateway strategy for global reach |
| 5 | [05_flows_and_structure.md](file:///Users/safwan/.gemini/antigravity/brain/74c5f74a-1c4a-46e6-a78c-385bdf084255/05_flows_and_structure.md) | Technical user flows (QR scan, remote pickup, curbside, kiosk) with API calls + edge cases, proposed monorepo folder structure |
| 6 | [06_delivery_plan_and_recommendations.md](file:///Users/safwan/.gemini/antigravity/brain/74c5f74a-1c4a-46e6-a78c-385bdf084255/06_delivery_plan_and_recommendations.md) | 7-phase delivery plan with outputs/dependencies/risks/fallbacks, final recommendations and decisions |

## Key Decisions Summary

| Decision | Recommendation |
|----------|---------------|
| **Architecture** | Monorepo with shared npm packages + multiple app entry points |
| **Build first** | QR Table Self-Order (smallest scope, highest restaurant value) |
| **Curbside** | Fulfillment mode within Customer Ordering app (not separate app) |
| **Kiosk** | Separate thin app shell sharing 95% of logic with QR app |
| **Payment** | Abstract behind `URY Payment Gateway` doctype; start with Stripe + Razorpay |
| **WhatsApp** | Integrate via `frappe_whatsapp`; templates for order confirm, ready, invoice |
| **Auth** | Staff: Frappe session (existing); QR: signed JWT; Customer: OTP; Kiosk: device token |

## Verification Plan

> Since this is a **planning-only deliverable**, there are no code changes to test. Verification is through document review.

### Review Checklist
1. **Accuracy** — Does the code analysis match your understanding of URY?
2. **Architecture** — Is monorepo + domain packages the right approach?
3. **App splits** — Are the 5 apps the right boundaries?
4. **Phase order** — Is QR Table the correct first target?
5. **Payment strategy** — Are the gateway choices appropriate for your target markets?
6. **WhatsApp scope** — Are the proposed templates and flows sufficient?
7. **Missing concerns** — Anything not covered (e.g., delivery partner integration, loyalty, multi-language)?
