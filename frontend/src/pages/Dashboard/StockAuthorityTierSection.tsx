import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Badge, Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, showToast, Spinner } from '@ury/ui';
import { call, getLoggedUser, getUserRoles } from '@ury/core';

/**
 * Roles permitted to change a branch's stock authority tier from the
 * dashboard. Mirrors `STOCK_AUTHORITY_TIER_WRITE_ROLES` in
 * `ury.ury.api.ury_branch_stock_policy_ui`, and the doctype's own
 * `URY Branch Stock Policy` permissions block (System Manager: full CRUD;
 * URY Manager / Stock Manager: read only) -- see
 * tracks/sa-pos-followups-and-ux/ITEM_5_TIER_TOGGLE_UI.md section 4,
 * option (a). Keep in sync with the backend constant if it ever changes.
 */
export const STOCK_AUTHORITY_TIER_ALLOWED_ROLES = ['System Manager'];

/** The four legal tier names, matching the backend's `_TIER_GATES` keys in
 * `ury.ury.api.ury_branch_stock_policy_ui` exactly -- this is the entire
 * vocabulary the control can submit. */
export const TIER_1_NATIVE = 'Tier 1 - Native';
export const TIER_2_RESERVATIONS = 'Reservations Only';
export const TIER_3_PRODUCTION = 'Production Posting';
export const TIER_4_FULL_ENFORCEMENT = 'Full Enforcement';

type StockAuthorityTier =
  | typeof TIER_1_NATIVE
  | typeof TIER_2_RESERVATIONS
  | typeof TIER_3_PRODUCTION
  | typeof TIER_4_FULL_ENFORCEMENT;

/** Ordered low-to-high, matching ITEM_5_TIER_TOGGLE_UI.md section 3.1's
 * table. Helper text mirrors the doctype's own field descriptions
 * (`ury_branch_stock_policy.json`) so Desk and dashboard never drift out of
 * sync. */
const TIER_OPTIONS: Array<{ tier: StockAuthorityTier; label: string; helperText: string }> = [
  {
    tier: TIER_1_NATIVE,
    label: 'Tier 1 — Native (default)',
    helperText:
      'No reservation tracking, no production ledger, no closing checks. Stock deducts only at POS Closing consolidation, exactly like today.',
  },
  {
    tier: TIER_2_RESERVATIONS,
    label: 'Reservations Only',
    helperText: 'Order availability accounts for live reservations. No stock ledger entries are created.',
  },
  {
    tier: TIER_3_PRODUCTION,
    label: 'Production Posting (advisory)',
    helperText:
      'Kitchen READY events for made-to-order items create real Manufacture Stock Entries. Closing does not yet block on them.',
  },
  {
    tier: TIER_4_FULL_ENFORCEMENT,
    label: 'Full Enforcement',
    helperText:
      'POS Closing Entry blocks until all production is posted and all reservations are reconciled.',
  },
];

const TIER_ORDER: StockAuthorityTier[] = [TIER_1_NATIVE, TIER_2_RESERVATIONS, TIER_3_PRODUCTION, TIER_4_FULL_ENFORCEMENT];

const tierRank = (tier: StockAuthorityTier) => TIER_ORDER.indexOf(tier);

const tierBadgeVariant = (tier: StockAuthorityTier): 'default' | 'info' | 'warning' | 'danger' => {
  if (tier === TIER_1_NATIVE) return 'default';
  if (tier === TIER_2_RESERVATIONS) return 'info';
  if (tier === TIER_3_PRODUCTION) return 'warning';
  return 'danger';
};

interface BranchStockAuthority {
  branch: string;
  tier: StockAuthorityTier;
  reservation_control_enabled: boolean;
  realtime_production_posting_enabled: boolean;
  closing_reconciliation_enabled: boolean;
  enabled_by?: string | null;
  enabled_on?: string | null;
}

/** Modal copy per ITEM_5_TIER_TOGGLE_UI.md section 3.2, keyed by the tier
 * being switched TO. Each has an explicit affirmative button naming the
 * change -- never a bare "OK"/"Confirm". */
const CONFIRM_COPY: Record<
  StockAuthorityTier,
  { title: (branch: string) => string; body: string; confirmLabel: string; upwardOnly?: boolean }
> = {
  [TIER_1_NATIVE]: {
    title: (branch) => `Disable stock authority gates for ${branch}?`,
    body: 'This turns off reservation control, production posting, and closing reconciliation. Existing records already created under this policy (Stock Entries, reservations) are not reversed — this only changes what happens going forward.',
    confirmLabel: 'Disable All Gates',
  },
  [TIER_2_RESERVATIONS]: {
    title: (branch) => `Enable Reservation Control for ${branch}?`,
    body: 'Order availability will start subtracting live reservations for this branch. No stock ledger entries are created by this tier — sales still post the same way at Closing. This does not affect any other branch.',
    confirmLabel: 'Enable Reservation Control',
  },
  [TIER_3_PRODUCTION]: {
    title: (branch) => `Enable Realtime Production Posting for ${branch}?`,
    body: 'From now on, when a kitchen ticket item for a made-to-order product reaches READY, URY will create a real Manufacture Stock Entry against this branch\'s warehouse. This is a live inventory movement, not a preview — verify your BOMs and warehouse mapping for this branch before enabling. POS Closing will not yet block on these postings.',
    confirmLabel: 'Enable Production Posting',
  },
  [TIER_4_FULL_ENFORCEMENT]: {
    title: (branch) => `Enable Full Enforcement for ${branch}?`,
    body: 'POS Closing Entry for this branch will now be blocked until every production posting is complete and every reservation is reconciled. Cashiers/managers closing the day will see a hard stop if this branch has unposted production. Make sure staff have been trained on the new closing checklist before enabling this in a live branch.',
    confirmLabel: 'Enable Full Enforcement',
  },
};

/** Downward change to a tier that is not Tier 1 still needs its own
 * "disable" framing (it is disabling whichever gate that tier represents,
 * not just "going to Tier 1"). Since the four tiers are strictly ordered
 * and any downward move ultimately just re-runs the doctype's own
 * dependency rules server-side, this uses a generic downward-disable copy
 * keyed by the tier being left, distinct from the TIER_1_NATIVE entry
 * above (which covers the "disable everything" case specifically). */
const downwardCopy = (fromTier: StockAuthorityTier, branch: string) => {
  const disabledLabel =
    fromTier === TIER_4_FULL_ENFORCEMENT
      ? 'Closing Reconciliation'
      : fromTier === TIER_3_PRODUCTION
        ? 'Realtime Production Posting'
        : 'Reservation Control';
  return {
    title: () => `Disable ${disabledLabel} for ${branch}?`,
    body: `This turns off ${disabledLabel} (and any tier above it). Existing records already created under this policy (Stock Entries, reservations) are not reversed — this only changes what happens going forward.`,
    confirmLabel: `Disable ${disabledLabel}`,
  };
};

interface StockAuthorityTierSectionProps {
  branch: string;
  branchLabel: string;
}

/**
 * "Stock Authority" section for the Branch detail view
 * (`BranchPage.tsx`). Shows the current tier as a read-only badge to any
 * dashboard user who can view the branch, and renders the tier-change
 * control only for a caller holding `STOCK_AUTHORITY_TIER_ALLOWED_ROLES`.
 * See tracks/sa-pos-followups-and-ux/ITEM_5_TIER_TOGGLE_UI.md.
 */
export const StockAuthorityTierSection: React.FC<StockAuthorityTierSectionProps> = ({ branch, branchLabel }) => {
  const [loading, setLoading] = useState(true);
  const [authority, setAuthority] = useState<BranchStockAuthority | null>(null);
  const [roleStatus, setRoleStatus] = useState<'loading' | 'allowed' | 'denied'>('loading');
  const [pendingTier, setPendingTier] = useState<StockAuthorityTier | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchAuthority = async () => {
    setLoading(true);
    try {
      const res = await call<BranchStockAuthority>('ury.ury.api.ury_branch_stock_policy_ui.get_branch_stock_authority', {
        branch,
      });
      const data = (res as any)?.message ?? res;
      setAuthority(data);
    } catch (e: any) {
      console.error('Failed to load stock authority tier', e);
      showToast.error(e?.message || 'Failed to load stock authority tier');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!branch) return;
    fetchAuthority();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const userId = await getLoggedUser();
        if (!userId) {
          if (!cancelled) setRoleStatus('denied');
          return;
        }
        const { roles } = await getUserRoles(userId);
        const allowed = (roles || []).some((role) => STOCK_AUTHORITY_TIER_ALLOWED_ROLES.includes(role));
        if (!cancelled) setRoleStatus(allowed ? 'allowed' : 'denied');
      } catch (e) {
        console.error('Failed to check stock authority tier access role', e);
        if (!cancelled) setRoleStatus('denied');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentTier = authority?.tier ?? TIER_1_NATIVE;

  const handlePickTier = (tier: StockAuthorityTier) => {
    if (tier === currentTier) return;
    setErrorMessage(null);
    setPendingTier(tier);
  };

  const handleConfirm = async () => {
    if (!pendingTier) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      const res = await call<BranchStockAuthority>('ury.ury.api.ury_branch_stock_policy_ui.set_branch_stock_authority_tier', {
        branch,
        tier: pendingTier,
      });
      const data = (res as any)?.message ?? res;
      setAuthority(data);
      showToast.success(`Stock authority tier updated to ${pendingTier}`);
      setPendingTier(null);
    } catch (e: any) {
      // Surface the backend rejection verbatim -- never swallowed or
      // auto-corrected (ITEM_5_TIER_TOGGLE_UI.md section 3.3 / acceptance
      // criterion 6).
      const message = e?.message || e?.exc_type || 'Failed to update stock authority tier';
      setErrorMessage(message);
      showToast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const isUpward = pendingTier ? tierRank(pendingTier) > tierRank(currentTier) : false;
  const confirmCopy = pendingTier
    ? isUpward || pendingTier === TIER_1_NATIVE
      ? CONFIRM_COPY[pendingTier]
      : downwardCopy(currentTier, branchLabel)
    : null;

  return (
    <div>
      <div className="flex items-center gap-2.5 pb-2 border-b border-border mb-4">
        <div className="w-7 h-7 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <ShieldCheck className="w-4 h-4" />
        </div>
        <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Stock Authority</h3>
      </div>

      {loading ? (
        <div className="py-6 flex items-center justify-center">
          <Spinner className="w-6 h-6 text-primary" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-foreground">Current Tier:</span>
            <Badge variant={tierBadgeVariant(currentTier)} data-testid="stock-authority-tier-badge">
              {currentTier}
            </Badge>
          </div>

          {(authority?.enabled_by || authority?.enabled_on) && (
            <p className="text-xs text-muted-foreground">
              Last changed by <span className="font-medium text-foreground">{authority?.enabled_by || 'Unknown'}</span>
              {authority?.enabled_on ? (
                <>
                  {' '}on <span className="font-medium text-foreground">{authority.enabled_on}</span>
                </>
              ) : null}
            </p>
          )}

          {roleStatus === 'allowed' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label="Stock Authority Tier">
                {TIER_OPTIONS.map((option) => {
                  const isSelected = option.tier === currentTier;
                  return (
                    <label
                      key={option.tier}
                      className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                        isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`stock-authority-tier-${branch}`}
                        className="mt-1"
                        checked={isSelected}
                        disabled={saving}
                        onChange={() => handlePickTier(option.tier)}
                      />
                      <span>
                        <span className="block text-sm font-medium text-foreground">{option.label}</span>
                        <span className="block text-xs text-muted-foreground mt-0.5">{option.helperText}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {errorMessage && (
                <p className="text-xs text-destructive" data-testid="stock-authority-error">
                  {errorMessage}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <Dialog open={!!pendingTier} onOpenChange={(open) => !open && !saving && setPendingTier(null)}>
        <DialogContent onClose={() => !saving && setPendingTier(null)}>
          <DialogHeader>
            <DialogTitle>{confirmCopy?.title(branchLabel)}</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-2 text-sm text-muted-foreground">{confirmCopy?.body}</div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingTier(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={saving}>
              {saving ? <Spinner className="w-4 h-4 mr-1.5" /> : null}
              {confirmCopy?.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StockAuthorityTierSection;
