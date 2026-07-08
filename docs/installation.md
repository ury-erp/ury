# URY Installation Guide

This guide covers installing URY into a Frappe bench. For the official upstream guide, see https://ury.app/docs/Installation/.

> **Prerequisites**
> - A working Frappe bench environment.
> - Python >= 3.10
> - Node.js >= 18.20
> - It is recommended to install URY on a new Frappe site rather than an existing ERPNext instance.

---

## 1. Install ERPNext

Install ERPNext into your bench using the version-15 branch:

```bash
bench get-app --branch version-15 erpnext https://github.com/frappe/erpnext.git
```

For detailed bench setup instructions, see the [official Frappe bench installation guide](https://github.com/frappe/bench#installation).

---

## 2. Install Frappe HR

Frappe HR is required for employee management reports in URY.

```bash
bench get-app --branch hrms https://github.com/frappe/hrms.git
```

---

## 3. Install URY

```bash
bench get-app ury https://github.com/ury-erp/ury.git
```

This clones the URY app into your bench's `apps/` directory.

---

## 4. Create a New Site

```bash
bench new-site sitename
```

Replace `sitename` with your desired site name.

---

## 5. Install Apps into the Site

```bash
# Install ERPNext
bench --site sitename install-app erpnext

# Install Frappe HR
bench --site sitename install-app hrms

# Install URY
bench --site sitename install-app ury
```

---

## 6. Build and Migrate

```bash
# Build assets
bench --site sitename build

# Run migrations
bench --site sitename migrate
```

---

## 7. Build Frontends (for Development)

URY includes three frontend applications managed by a Yarn workspace at the repo root:

```bash
cd apps/ury

# Install dependencies
yarn install

# Build all frontends
yarn build

# Or build individually
cd pos && yarn build
cd ../URYMosaic && yarn build
cd ../urypos && yarn build
```

After building, copy assets into the Frappe public directory:

```bash
bench build --app ury
```

---

## 8. Start the Server

```bash
bench start
```

Your site should now be accessible, and URY should be installed and ready for setup.

---

## Quick Reference

```bash
# Full fresh install sequence
bench get-app --branch version-15 erpnext https://github.com/frappe/erpnext.git
bench get-app --branch hrms https://github.com/frappe/hrms.git
bench get-app ury https://github.com/ury-erp/ury.git
bench new-site sitename
bench --site sitename install-app erpnext
bench --site sitename install-app hrms
bench --site sitename install-app ury
bench --site sitename build
bench --site sitename migrate
bench start
```
