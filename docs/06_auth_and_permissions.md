# Auth and Permissions

## Overview
The URY application extends ERPNext's standard authentication and permission model to cater to restaurant-specific roles and responsibilities. It introduces custom roles and specific mappings to ensure users have the correct access levels based on their operational duties.

## Custom Roles
The system introduces the following custom roles:
- **URY Manager**: Has overarching permissions, including access to reports, cancellations, and overall branch management.
- **URY Captain**: Restricted role primarily focused on taking orders, managing tables, and creating KOTs (Kitchen Order Tickets).
- **URY Cashier**: Responsible for billing, POS opening and closing entries, and handling payments.

## User Mapping
The `URY User` doctype acts as a mapping table to link standard ERPNext `User` accounts to specific physical locations within the restaurant.
- **Fields Mapping**: Maps a `User` to a specific `URY Room`.
- **Purpose**: This ensures that when a user logs into the POS or KDS, they are automatically associated with the correct room/branch, filtering the data (like tables and orders) relevant only to their assigned location.

## POS Profile Permissions
The `POS Profile` has been extended with custom fields to enforce role-based access control within the POS interface:
- **Billing Permissions**: The `role_allowed_for_billing` (Table MultiSelect) field specifies which roles are permitted to generate and print final invoices.
- **Table Order Restrictions**: The `role_restricted_for_table_order` (Table MultiSelect) field prevents specific roles from interacting with table orders, limiting them to POS or takeaway operations.
- **Role Transfer**: The `transfer_role_permissions` field dictates which roles have the authority to transfer tables or orders between users.
- **Cashier Configurations**: Fields like `custom_enable_multiple_cashier` and `custom_main_cashier` (in `POS Profile User`) manage scenarios where multiple users operate the same cash register or shifts.
