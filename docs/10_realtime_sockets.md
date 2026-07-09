# Realtime Sockets

The URY system leverages Frappe's realtime capabilities (Socket.io) to orchestrate cross-device communication, essential for synchronized operations across the POS, Kitchen Displays (Mosaic), and Print Servers.

## 1. Print Channel
Used as part of the Web/Fallback printing architecture to trigger physical prints on remote clients.

* **Channel Name**: `print_<branch_name>` (e.g., `print_Main Branch`)
* **Trigger**: Broadcasted by `print_pos_page` in `ury_print.py` when an invoice is finalized and no direct local/network printer is configured.
* **Payload**: 
  ```json
  {
    "data": {
      "name": "INV-0001",
      "doctype": "POS Invoice",
      "print_format": "Standard"
    }
  }
  ```
* **Consumer**: A dedicated listening device or browser session associated with the branch intercepts this payload and renders the specified print format.

## 2. KOT Updates
While KOTs heavily rely on standard Frappe document lifecycle events (which natively push updates to active sessions via `frappe.publish_realtime` on the `doc_update` channel), explicit custom channels for KOT are not hardcoded in the primary Python API. Clients, such as the URY Mosaic, generally consume changes via Frappe's default list real-time updates or by polling `kot_list` / `served_kot_list`.
