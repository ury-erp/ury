/**
 * PLAN.md item 5 — report router intent.
 *
 * HUF_API_NOTES.md confirms a real client-side-tool-call mechanism exists
 * (`ai/client_side_tool.py`: Redis-backed dispatch, the browser executes the
 * tool and calls `submit_client_tool_result`), but its exact wire format
 * (how a dispatched call surfaces on `send_message_to_conversation`'s
 * response, what the correlation id/payload keys are named) was not
 * inspected live in this session — HUF_API_NOTES.md says only that the
 * shape is "confirmed to exist," not enumerated field-by-field.
 *
 * Rather than guess at fields that may not match the real payload, this
 * module implements a narrow, well-isolated convention we control end to
 * end: `ury_chat.send_chat_message`'s `response` is inspected for either
 * - a `report_slug` (or nested `tool_call.report_slug`) field, the
 *   "structured" case, or
 * - a `[[navigate_to_report:<slug>]]` directive embedded in the message
 *   text, the "the model was told to emit this token" case.
 *
 * Everything here is a pure function (no navigation side effects) so it's
 * easy to re-point at the real client-side-tool-call payload shape once
 * that's inspected live against the running HUF bench — see PLAN.md
 * Phase 7/8 for the follow-up verification pass this is deliberately
 * scoped to unblock rather than pre-empt.
 */

const NAVIGATE_DIRECTIVE = /\[\[navigate_to_report:([a-z0-9-]+)\]\]/i;

/** Slugs this module will ever navigate to — mirrors CONTEXT.md's reports
 * catalog (`frontend/src/pages/Reports/reportsRegistry.ts`). Anything else
 * found in a response is ignored rather than blindly navigated to. */
const KNOWN_REPORT_SLUGS = new Set([
  'today-sales',
  'daywise-sales',
  'daywise-invoices',
  'month-wise-sales',
  'time-wise-sales',
  'service-wise-sales',
  'cancelled-invoices',
  'average-bill-value',
  'item-wise-sales',
  'item-wise-purchase-history',
  'customer-data',
  'daywise-customer-details',
  'repeated-customers',
  'employee-sales',
  'employee-item-wise-sales',
  'completed-work-orders',
  'daily-pnl',
]);

function extractSlugFromStructuredResponse(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null;
  const obj = response as Record<string, any>;
  const candidate = obj.report_slug ?? obj.tool_call?.report_slug ?? obj.tool_call?.arguments?.report_slug;
  return typeof candidate === 'string' ? candidate : null;
}

function extractSlugFromMessageText(text: string | undefined | null): string | null {
  if (!text) return null;
  const match = NAVIGATE_DIRECTIVE.exec(text);
  return match ? match[1] : null;
}

/**
 * Given a `send_chat_message` response payload and/or the plain message
 * text HUF returned, resolve a report slug to navigate to — or `null` if
 * there's no navigation intent, or the slug isn't one of ours.
 */
export function resolveReportNavigation(
  response: unknown,
  messageText?: string | null
): string | null {
  const slug = extractSlugFromStructuredResponse(response) ?? extractSlugFromMessageText(messageText);
  if (!slug || !KNOWN_REPORT_SLUGS.has(slug)) return null;
  return slug;
}

/**
 * Reports live in the separate `frontend` SPA (basename `/ury`, see
 * frontend/src/App.tsx), not in this `pos` app (basename `/pos`) — so this
 * is a cross-app hard navigation, not an in-app `react-router` `navigate()`
 * call as PLAN.md item 5 phrases it for the general case. Kept as a plain
 * function (not a hook) so it's obvious at the call site that it leaves the
 * pos SPA entirely.
 */
export function navigateToReportSlug(slug: string) {
  window.location.href = `/ury/reports/${slug}`;
}
