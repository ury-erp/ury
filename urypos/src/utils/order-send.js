import { parseFrappeError } from "../../../packages/core/src/frappe/errors.ts";

export function orderSendLabel(invoice, pending) {
  if (pending) return "Sending…";
  return invoice ? "Send Changes" : "Send to Kitchen";
}

export function orderSendError(error) {
  return parseFrappeError(
    error,
    "Could not send to kitchen. Your cart has been kept. Please try again."
  ).replace(
    /Please (?:reload|refresh) the page[^.]*\./gi,
    "Reopen the table from Tables to retrieve the latest order before sending again."
  );
}
