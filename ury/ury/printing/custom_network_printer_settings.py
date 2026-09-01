# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import os
import frappe
from frappe import _
from frappe.printing.doctype.network_printer_settings.network_printer_settings import (
    NetworkPrinterSettings,
)
from ury.ury.printing.service import (
    _make_print_job_id,
    submit_and_monitor_print_job,
)


class CustomNetworkPrinterSettings(NetworkPrinterSettings):
    """Extended Network Printer Settings with atomic monitored print capabilities."""

    def print_doc(
        self,
        doctype: str,
        name: str,
        print_format: str = None,
        doc=None,
        no_letterhead: int = 0,
        job_type: str = "BILL",
        extra_metadata: dict = None,
        copies: int = 1,
    ) -> dict:
        """Render a Frappe document to PDF, submit to this printer, and track via URY Print Job."""
        return submit_and_monitor_print_job(
            doctype=doctype,
            name=name,
            printer_setting=self.name,
            print_format=print_format,
            doc=doc,
            no_letterhead=no_letterhead,
            job_type=job_type,
            extra_metadata=extra_metadata,
            copies=copies,
        )

    def print_file(
        self,
        file_path: str,
        job_name: str = None,
        job_type: str = "BILL",
        extra_metadata: dict = None,
        copies: int = 1,
    ) -> dict:
        """Submit an existing pre-rendered PDF file directly to CUPS without re-rendering."""
        if not file_path or not os.path.exists(file_path):
            return {
                "status": "Failure",
                "message": f"Print file not found at: {file_path}",
            }

        try:
            import cups
        except ImportError:
            return {"status": "Failure", "message": "Failed to import cups library"}

        try:
            cups.setServer(self.server_ip)
            cups.setPort(self.port)
            conn = cups.Connection()
        except Exception as e:
            return {
                "status": "Failure",
                "message": f"Failed to connect to printer '{self.name}': {e}",
            }

        doc_name = job_name or os.path.basename(file_path)
        cups_job_id = None
        print_count = max(1, int(copies or 1))

        try:
            for _ in range(print_count):
                cups_job_id = conn.printFile(
                    self.printer_name, file_path, doc_name, {}
                )

            print_job_id = _make_print_job_id(self.printer_name, cups_job_id)

            user_owner = (
                (extra_metadata.get("job_owner") or extra_metadata.get("owner") or extra_metadata.get("user"))
                if extra_metadata else None
            )
            if not user_owner:
                session_user = getattr(frappe, "session", None) and getattr(frappe.session, "user", None)
                if session_user and session_user != "Guest":
                    user_owner = session_user
                else:
                    user_owner = "Administrator"

            table_name = (
                (extra_metadata.get("table") or extra_metadata.get("restaurant_table")) if extra_metadata else None
            )

            metadata = {
                "print_job_id": print_job_id,
                "cups_job_id": cups_job_id,
                "job_type": job_type,
                "printer": self.name,
                "printer_name": self.printer_name,
                "server_ip": self.server_ip,
                "port": self.port,
                "file_path": file_path,
                "status": "SUBMITTED",
                "created_at": frappe.utils.now(),
                "job_owner": user_owner,
                "table": table_name,
                "restaurant_table": table_name,
            }

            if extra_metadata:
                metadata.update(extra_metadata)

            from ury.ury.printing.print_job_monitor import register_print_job

            register_print_job(metadata)

            frappe.enqueue(
                "ury.ury.printing.print_job_poller.poll_single_print_job",
                print_job_id=print_job_id,
                queue="default",
                timeout=60,
                now=frappe.flags.in_test,
            )

            return {
                "status": "Success",
                "cups_job_id": cups_job_id,
                "print_job_id": print_job_id,
                "printer": self.name,
                "file_path": file_path,
            }
        except Exception as e:
            frappe.logger("printing").error(
                f"Failed to submit file to printer {self.name}: {e}", exc_info=True
            )
            return {"status": "Failure", "message": f"Print failed: {e}"}

    def test_printer_connection(self) -> dict:
        """Test reachability of CUPS printer server and queue."""
        try:
            import cups

            cups.setServer(self.server_ip)
            cups.setPort(self.port)
            conn = cups.Connection()
            printers = conn.getPrinters()
            is_present = self.printer_name in printers
            return {
                "status": "Success" if is_present else "Warning",
                "connected": True,
                "printer_found": is_present,
                "printer_info": printers.get(self.printer_name, {}),
            }
        except Exception as e:
            return {"status": "Failure", "connected": False, "message": str(e)}
