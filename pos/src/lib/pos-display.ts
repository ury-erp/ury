// src/lib/pos-display.ts
// Ury POS Dual Screen Display - Production Version

const BRIDGE_URL = "http://localhost:8000";
const DEFAULT_DWELL_MS = 5000; // Default 5 seconds if no setting

let lastTotal: number | null = null;
let lastChange: number | null = null;
let isDialogOpen = false;
let enabled = false;
let posType = "";
let dwellMs = DEFAULT_DWELL_MS;
let observer: MutationObserver | null = null;
let initialized = false;
let loopTimer: ReturnType<typeof setTimeout> | null = null;
let loopIndex = 0; // 0: total, 1: change

function parseLoopTimerToMs(val: unknown): number {
  if (val == null) return DEFAULT_DWELL_MS;
  
  if (typeof val === "number" && Number.isFinite(val)) {
    const ms = Math.max(0, val) * 1000;
    return ms || DEFAULT_DWELL_MS;
  }
  
  if (typeof val === "string") {
    const s = val.trim();
    // Accept plain number of seconds as string
    if (/^\d+(\.\d+)?$/.test(s)) {
      const ms = Math.max(0, parseFloat(s)) * 1000;
      return ms || DEFAULT_DWELL_MS;
    }
    // Accept HH:MM:SS (Frappe Time field)
    const m = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
    if (m) {
      const h = parseInt(m[1], 10) || 0;
      const mi = parseInt(m[2], 10) || 0;
      const se = parseInt(m[3] || "0", 10) || 0;
      const totalSec = (h * 3600) + (mi * 60) + se;
      const ms = totalSec * 1000;
      return ms || DEFAULT_DWELL_MS;
    }
  }
  
  return DEFAULT_DWELL_MS;
}

async function fetchSettings(): Promise<boolean> {
  try {
    const [enabledRes, posTypeRes, loopTimerRes] = await Promise.all([
      fetch("/api/method/frappe.client.get_single_value?" + new URLSearchParams({
        doctype: "POS Dual Screen Settings",
        field: "enabled"
      })),
      fetch("/api/method/frappe.client.get_single_value?" + new URLSearchParams({
        doctype: "POS Dual Screen Settings",
        field: "pos_type"
      })),
      fetch("/api/method/frappe.client.get_single_value?" + new URLSearchParams({
        doctype: "POS Dual Screen Settings",
        field: "loop_timer"
      }))
    ]);

    const [enabledData, posTypeData, loopTimerData] = await Promise.all([
      enabledRes.json(),
      posTypeRes.json(),
      loopTimerRes.json()
    ]);

    enabled = enabledData.message === 1 || enabledData.message === "1";
    posType = (posTypeData.message || "").toLowerCase().trim();
    dwellMs = parseLoopTimerToMs(loopTimerData.message);

    return true;
  } catch (e) {
    console.error("[ury_display] Settings error:", e);
    // Default to enabled for Ury if fetch fails
    enabled = true;
    posType = "ury";
    dwellMs = DEFAULT_DWELL_MS;
    return false;
  }
}

function shouldRun(): boolean {
  return enabled && posType === "ury";
}

async function sendToDisplay(type: string, value: number): Promise<boolean> {
  if (!shouldRun()) return false;
  try {
    const r = await fetch(`${BRIDGE_URL}/update_display`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, value }),
    });
    const j = await r.json();
    return j?.status === "success";
  } catch {
    return false;
  }
}

async function clearDisplay(): Promise<void> {
  if (!shouldRun()) return;
  
  // Try clear command first
  try {
    const r = await fetch(`${BRIDGE_URL}/update_display`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "clear" }),
    });
    const j = await r.json();
    if (j?.status === "success") return;
  } catch {}
  
  // Fallback to sending zeros
  await sendToDisplay("total", 0);
  await sendToDisplay("change", 0);
}

function stopLoop(): void {
  if (loopTimer) {
    clearTimeout(loopTimer);
    loopTimer = null;
  }
  loopIndex = 0;
}

async function loopStep(): Promise<void> {
  if (!isDialogOpen || !shouldRun()) {
    stopLoop();
    return;
  }

  const total = lastTotal ?? 0;
  const change = lastChange ?? 0;

  // Only loop if there's change to show
  if (change > 0) {
    if (loopIndex % 2 === 0) {
      await sendToDisplay("total", total);
    } else {
      await sendToDisplay("change", change);
    }
    loopIndex++;
    loopTimer = setTimeout(loopStep, dwellMs);
  } else {
    // No change, just show total once
    await sendToDisplay("total", total);
    // Keep checking for changes
    loopTimer = setTimeout(loopStep, dwellMs);
  }
}

function startLoop(): void {
  stopLoop();
  loopIndex = 0;
  loopStep();
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

function extractPaymentsTotal(): number {
  // Look for "Total Entered" section which shows paymentsTotal / finalTotal
  const spans = document.querySelectorAll("span");
  
  for (const span of spans) {
    if (span.textContent?.includes("Total Entered")) {
      // Find the sibling or nearby element with the amounts
      const parent = span.closest("div");
      if (parent) {
        const text = parent.textContent || "";
        // Pattern: "123.45 / 100.00" - we want the first number (payments total)
        const matches = text.match(/[\d,]+\.?\d*/g);
        if (matches && matches.length >= 1) {
          const paymentsTotal = parseFloat(matches[0].replace(/,/g, ""));
          if (!isNaN(paymentsTotal)) return paymentsTotal;
        }
      }
    }
  }
  
  // Alternative: Look for payment input fields and sum them
  const paymentInputs = document.querySelectorAll('input[type="number"]');
  let total = 0;
  
  paymentInputs.forEach(input => {
    const value = parseFloat((input as HTMLInputElement).value || "0");
    if (!isNaN(value) && value > 0) {
      total += value;
    }
  });
  
  return total;
}

function calculateChange(finalTotal: number, paymentsTotal: number): number {
  if (paymentsTotal > finalTotal) {
    return paymentsTotal - finalTotal;
  }
  return 0;
}

async function checkAndUpdate(): Promise<void> {
  if (!shouldRun()) return;

  const dialogVisible = isPaymentDialogVisible();

  // Dialog just opened
  if (dialogVisible && !isDialogOpen) {
    isDialogOpen = true;
    lastTotal = null;
    lastChange = null;
  }

  // Dialog just closed
  if (!dialogVisible && isDialogOpen) {
    isDialogOpen = false;
    lastTotal = null;
    lastChange = null;
    stopLoop();
    await clearDisplay();
    return;
  }

  // Dialog is open - extract values and update
  if (dialogVisible) {
    const total = extractFinalTotal();
    const paymentsTotal = extractPaymentsTotal();
    const change = total !== null ? calculateChange(total, paymentsTotal) : 0;

    const totalChanged = total !== null && total !== lastTotal;
    const changeChanged = change !== lastChange;

    if (totalChanged || changeChanged) {
      lastTotal = total;
      lastChange = change;
      
      // Restart the loop with new values
      startLoop();
    }
  }
}

export async function initPosDisplay(): Promise<void> {
  if (initialized) return;

  await fetchSettings();

  if (!shouldRun()) return;

  observer = new MutationObserver(() => {
    setTimeout(checkAndUpdate, 50);
  });

  observer.observe(document.body, { childList: true, subtree: true });
  checkAndUpdate();

  initialized = true;
}

export function destroyPosDisplay(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  stopLoop();
  initialized = false;
}