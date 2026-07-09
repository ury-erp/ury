# KOT (Kitchen Order Ticket) System

The KOT system manages the lifecycle of kitchen orders, from creation to serving, ensuring items are routed to the correct production units and statuses are accurately tracked.

## 1. KOT Generation
Handled primarily by `ury_kot_generate.py`, KOT generation is triggered when a POS Invoice is submitted or updated.

### Key Processes:
* **Item Processing & Splitting**: Items are extracted from the invoice and checked against the `POS Profile`'s branch production units. The system routes items to their respective `URY Production Unit` based on Item Groups.
* **Modification & Cancellation**: 
  * If an order is modified, the system compares the previous items with the new items. 
  * New items trigger a `New Order` or `Order Modified` KOT. 
  * Removed or reduced items trigger a `Partially cancelled` or `Cancelled` KOT. Cancelled KOTs maintain a reference to the `original_kot`.
* **Aggregator Support**: Invoices originating from Aggregators are flagged (`is_aggregator`) to be processed accordingly.

## 2. Validation & Fallback
To ensure no orders are missed due to transient errors, `ury_kot_validation.py` provides a fallback mechanism.

### Key Processes:
* **Background Thread**: `kotValidationThread` runs continuously to check for unprocessed `POS Invoice` records created between 1 and 5 minutes ago.
* **Reconciliation**: If an invoice exists but has no associated KOT, the system reconstructs the `Duplicate` KOT by matching the invoice items with the branch's production units.
* **Error Logging**: Recreated KOTs are logged in the `URY KOT Error Log` for auditing.

## 3. Order Numbering
`ury_kot_order_number.py` assigns sequential order numbers to KOTs to help staff track daily orders.

### Key Processes:
* **Daily Sequencing**: The sequence is maintained via the `POS Opening Entry`. 
* **Aggregator Distinction**: Aggregator orders maintain a separate sequence (prefixed with `AGR - `) from standard dine-in or takeaway orders.
* **Calculation**: The sequence is derived by comparing the current invoice number against the `custom_ury_last_invoice` stored in the shift's `POS Opening Entry`.

## 4. Display and Fulfillment (Mosaic/KDS)
`ury_kot_display.py` provides the APIs used by the Kitchen Display System (KDS) / URY Mosaic.

### Key Processes:
* **Retrieval**: Fetches active KOTs (`kot_list`) and completed KOTs (`served_kot_list`) filtered by branch, order status, and creation time (within the last 3 hours).
* **Production Filtering**: KOTs are filtered so that specific production units (kitchen screens) only see their assigned order types.
* **Lifecycle State Updates**: Exposes functions like `serve_kot` to mark a KOT as `Served`, calculating the `production_time` in minutes. It also allows users to explicitly verify cancelled orders via `confirm_cancel_kot`.
