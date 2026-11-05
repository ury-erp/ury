import { parseFrappeError } from "../../../packages/core/src/frappe/errors.ts";

export function orderSendLabel(invoice, pending) {
  if (pending) return "Sending…";
  return invoice ? "Send Changes" : "Send to Kitchen";
}

export function orderSendError(error) {
  const message = parseFrappeError(
    error,
    "Could not send to kitchen. Your cart has been kept. Please try again."
  );
  if (/already (?:been )?billed/i.test(message)) {
    return "This order has already been billed. Please ask the cashier.";
  }
  return message.replace(
    /Please (?:reload|refresh) the page[^.]*\./gi,
    "Reopen the table from Tables to retrieve the latest order before sending again."
  );
}
