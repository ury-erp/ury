export function isKotLate(minutes, warningMinutes) {
  const threshold = Number(warningMinutes);
  return Number.isFinite(threshold) && threshold > 0 && minutes >= threshold;
}

export function canRecallKot(kot, now) {
  if (kot.order_status !== "Served" || kot.production_time == null || kot.production_time === "") {
    return false;
  }
  const productionMinutes = Number(kot.production_time);
  const creation = new Date(kot.creation.replace(" ", "T")).getTime();
  const elapsed = now.getTime() - (creation + productionMinutes * 60000);
  return Number.isFinite(productionMinutes) && productionMinutes >= 0 && elapsed >= 0 && elapsed <= 900000;
}

export function recentServedQuery(branch, production, now) {
  const cutoff = new Date(now.getTime() - 900000);
  // Frappe datetimes are site-local, not UTC. `now` is adjusted to the clock
  // returned by kot_list, so a browser in another timezone uses the same window.
  const localCutoff = new Date(cutoff.getTime() - cutoff.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 19).replace("T", " ");
  return {
    doctype: "URY KOT",
    fields: ["name", "invoice", "restaurant_table", "table_takeaway", "order_no", "order_status", "creation", "production_time"],
    filters: {
      branch,
      production,
      order_status: "Served",
      docstatus: 1,
      type: ["not in", ["Cancelled", "Partially cancelled"]],
      modified: [">=", localCutoff],
    },
    order_by: "modified desc",
    limit_page_length: 100,
  };
}

export function kitchenErrorMessage(error, fallback) {
  const data = error?.response?.data || error;
  let message = data?.message || error?.message;
  if (data?._server_messages) {
    try {
      const messages = JSON.parse(data._server_messages);
      const first = typeof messages[0] === "string" ? JSON.parse(messages[0]) : messages[0];
      message = first?.message || message;
    } catch {
      // A malformed server response should still leave a useful visible error.
    }
  }
  return typeof message === "string" && message.trim()
    ? message.replace(/<[^>]*>/g, "")
    : fallback;
}
