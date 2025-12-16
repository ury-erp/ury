// src/lib/pos-display.ts

const BRIDGE_URL = "http://localhost:8000";
const DEBUG = true;

const log = (...args: unknown[]) => DEBUG && console.log("[ury_display]", ...args);

let lastTotal: number | null = null;
let isDialogOpen = false;
let enabled = false;
let posType = "";
let observer: MutationObserver | null = null;
let initialized = false;

async function fetchSettings(): Promise<boolean> {
  try {
    const [enabledRes, posTypeRes] = await Promise.all([
      fetch("/api/method/frappe.client.get_single_value?" + new URLSearchParams({
        doctype: "POS Dual Screen Settings",
        field: "enabled"
      })),
      fetch("/api/method/frappe.client.get_single_value?" + new URLSearchParams({
        doctype: "POS Dual Screen Settings",
        field: "pos_type"
      }))
    ]);

    const [enabledData, posTypeData] = await Promise.all([
      enabledRes.json(),
      posTypeRes.json()
    ]);

    enabled = enabledData.message === 1 || enabledData.message === "1";
    posType = (posTypeData.message || "").toLowerCase().trim();

    log("Settings loaded:", { enabled, posType });
    return true;
  } catch (e) {
    log("Settings fetch error:", e);
    enabled = true;
    posType = "ury";
    return false;
  }
}

async function sendTotal(value: number): Promise<boolean> {
  try {
    const r = await fetch(`${BRIDGE_URL}/update_display`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "total", value }),
    });
    const j = await r.json();
    log("Sent total:", value, "| Response:", j.status);
    return j?.status === "success";
  } catch (e) {
    log("Bridge error:", e);
    return false;
  }
}

async function clearDisplay(): Promise<void> {
  await sendTotal(0);
  log("Display cleared");
}

function isPaymentDialogVisible(): boolean {
  const h2s = document.querySelectorAll("h2");
  const h3s = document.querySelectorAll("h3");

  let hasPayment = false;
  let hasOrderSummary = false;

  for (const h2 of h2s) {
    if (h2.textContent?.trim() === "Payment") { hasPayment = true; break; }
  }
  for (const h3 of h3s) {
    if (h3.textContent?.trim() === "Order Summary") { hasOrderSummary = true; break; }
  }

  return hasPayment && hasOrderSummary;
}

function extractFinalTotal(): number | null {
  const h3s = document.querySelectorAll("h3");

  for (const h3 of h3s) {
    if (h3.textContent?.trim() !== "Order Summary") continue;

    const container = h3.parentElement;
    if (!container) continue;

    const borderTDiv = container.querySelector(".border-t");
    if (borderTDiv) {
      const text = borderTDiv.textContent || "";
      const matches = text.match(/[\d,]+\.?\d*/g);
      if (matches) {
        for (const match of matches) {
          const value = parseFloat(match.replace(/,/g, ""));
          if (value > 0) return value;
        }
      }
    }
  }
  return null;
}

async function checkAndUpdate(): Promise<void> {
  if (!enabled || posType !== "ury") return;

  const dialogVisible = isPaymentDialogVisible();

  if (dialogVisible && !isDialogOpen) {
    log("✅ Payment dialog OPENED");
    isDialogOpen = true;
  }

  if (!dialogVisible && isDialogOpen) {
    log("❌ Payment dialog CLOSED");
    isDialogOpen = false;
    lastTotal = null;
    await clearDisplay();
    return;
  }

  if (dialogVisible) {
    const total = extractFinalTotal();
    if (total !== null && total !== lastTotal) {
      log("💰 Sending total:", total);
      await sendTotal(total);
      lastTotal = total;
    }
  }
}

export async function initPosDisplay(): Promise<void> {
  if (initialized) {
    log("Already initialized, skipping");
    return;
  }

  log("🚀 Initializing POS Display...");
  
  await fetchSettings();

  if (!enabled) {
    log("⛔ POS Display is disabled");
    return;
  }

  if (posType !== "ury") {
    log("⛔ POS type is not Ury:", posType);
    return;
  }

  observer = new MutationObserver(() => {
    setTimeout(checkAndUpdate, 50);
  });

  observer.observe(document.body, { childList: true, subtree: true });
  checkAndUpdate();

  initialized = true;
  log("✅ Ury POS Display active");
}

export function destroyPosDisplay(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  initialized = false;
  log("POS Display destroyed");
}