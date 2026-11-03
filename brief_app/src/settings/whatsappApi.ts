import { csrfToken } from "../api";

export type WaStatus = {
  enabled: boolean;
  state: "None" | "Pending" | "Active";
  number_masked: string;
  verified_on: string;
  business_number: string;
  consent_text: string;
  consent_text_version: string;
};
export type WaStart = { code: string; command: string; expires_minutes: number; business_number: string; number_masked: string; consent_text_version: string };

const BASE = "/api/method/ury.ury.api.chairman_wa_onboard.";

async function call<T>(name: string, body?: Record<string, string>): Promise<T> {
  const res = await fetch(BASE + name, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-Frappe-CSRF-Token": csrfToken() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()).message as T;
}

export const getStatus = () => call<WaStatus>("status");
export const startLink = (number: string) => call<WaStart>("start_link", { number });
export const unlink = () => call<{ unlinked: number }>("unlink", {});
