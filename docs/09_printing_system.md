# Printing Architecture

The URY POS leverages a flexible printing architecture to accommodate various hardware setups, ranging from direct peripheral connections to network-based kitchen printers. The printing strategy is defined in the `POS Profile`.

## 1. QZ Tray Printing (Direct Websocket)
The preferred method for direct thermal receipt printing from the browser without OS print dialogs.

* **Implementation**: Managed by `pos_print.js`. The POS client connects to a local QZ Tray instance via WebSockets.
* **Security**: It fetches the QZ certificate (`qz_certificate`) from the site configuration to seamlessly authenticate the connection.
* **Execution**: Frappe generates the HTML print format, which is sent over the WebSocket to the default QZ printer. 
* **Confirmation**: Upon successful hardware printing, an API callback to `qz_print_update` validates the print and marks the `POS Invoice` as printed (`invoice_printed = 1`), simultaneously freeing the restaurant table if applicable.

## 2. Network Printing (CUPS Backend)
Designed for automated kitchen routing or when printers are exposed via network IP rather than locally attached.

* **Implementation**: Handled server-side via `ury_print.py` using the Python `cups` library.
* **Routing**: The `select_network_printer` function determines the target printer by checking `URY Printer Settings` against the specific restaurant room or the general `POS Profile`.
* **Execution**: The system renders the document as a PDF using `frappe.get_print(..., as_pdf=True)` and saves it to a temporary path. It then queues the file directly to the CUPS server (`conn.printFile`).
* **Confirmation**: Completes the cycle by updating the `POS Invoice` and table occupancy immediately on the backend.

## 3. Realtime Socket Printing (Web/Fallback)
Used when a separate device or print server is listening for print commands over the network.

* **Implementation**: Invoked via `print_pos_page` when the other two methods are not active.
* **Execution**: Uses Frappe's `publish_realtime` to broadcast a print event containing the document name and format to a branch-specific Socket.io channel (`print_<branch>`).
* **Consumption**: A listening client (e.g., a secondary display or specialized print daemon) receives the event and executes the physical print.
