# Order Types

The URY POS system categorizes orders into various types to handle different pricing, routing, and UI behaviors. This classification is primarily driven by the `order_type` field and related custom fields on the `POS Invoice` and `Sales Invoice`.

## Supported Order Types
1. **Dine In**: Bound to a specific Restaurant Table. KOTs (Kitchen Order Tickets) are generated, and invoices cannot be submitted until they are printed.
2. **Take Away / Parcel**: Walk-in orders not tied to a table. Handled directly by the cashier.
3. **Delivery**: Orders dispatched to customers.
4. **Phone In**: Orders placed via telephone, usually logged against customer phone numbers.
5. **Aggregators (Zomato, Swiggy, etc.)**: 
   - Third-party orders managed via the `custom_aggregator_id` field.
   - Naming series for these invoices often include an aggregator prefix.
   - Branch settings can specify if these should be marked as unpaid or exempt from standard taxes (`custom_make_unpaid`, `custom_no_taxes`).

## Technical Implementation
- **Order Type Assignment**: Automatically updated during the `before_insert` hook in `POS Invoice` based on the selected table or aggregator settings.
- **Aggregator Overrides**: The `on_update` hook in `Sales Invoice` intercepts aggregator orders to strip taxes and reset payment statuses based on branch-level custom configurations.
