# 00 — Method & Scoring

## Scope

Static, read-only review of `v3-test` @ `b35c904`, diffed against `develop` to understand what this branch introduces. Sources read: `self-order/src`, `pos/src`, `frontend/src`, `packages/ui/src`, `packages/core/src`, plus Tailwind presets, theme tokens and locale files.

**Not covered** (and why): no running instance was available in this environment, so nothing here rests on a screenshot. Every claim is traceable to a line of source. Where a claim depends on runtime behaviour (e.g. "this toast never fires"), the reasoning chain is stated in full so you can falsify it in thirty seconds.

## Verdict scale

| Verdict | Meaning |
|---|---|
| **Good** | Do not touch. Working as intended, often better than the industry median. Listed so it is protected from well-meaning refactors. |
| **OK** | Defensible today, will not scale. No user is currently harmed; the cost is future velocity or a ceiling on polish. |
| **Bad** | A user is measurably worse off. Confusion, lost time, lost money, or an exclusion. |

## Severity

| Sev | Definition | Response |
|---|---|---|
| **S1** | Causes a wrong action on money, an order, or an exclusion of a whole user class | Fix this sprint |
| **S2** | Reliably causes hesitation, re-reading, or a support question | Fix within two sprints |
| **S3** | Polish, consistency, or a future-cost item | Backlog, batch with adjacent work |

## Anatomy of an entry

Every observation uses this shape:

> ### ID — Title
> **Verdict** · **Severity** · **Surface**
> **Evidence:** `path/to/file.tsx:123`
> **What's happening:** the mechanical fact.
> **Why it matters:** the behavioural consequence, stated in terms of what the human does differently.
> **Better:** before/after, concrete.
> **Targeted action:** the smallest change that resolves it.
> **Regression check:** what else touches this, and what must not move.

## Bias declaration

Three lenses were applied deliberately, and it is worth naming them so you can discount them if you disagree:

1. **Signifier honesty (Norman).** The strongest criticisms in this audit are of places where the interface *says* one thing and *does* another — a legend with the wrong colours, a button labelled "Preview" that navigates away, a green total that is green while wrong. Aesthetic inconsistency is graded far more gently than semantic dishonesty.
2. **Cost of an error under time pressure.** A POS at 8pm on a Friday is not a desktop app. An extra confirmation there is a feature; an extra keystroke is a defect. The POS is judged against that, not against a CRM.
3. **Data display rigour.** Money, dates and counts are held to a strict standard: money always carries a currency and a fixed number of decimals; a number shown without a comparison is an unfinished thought; a live-updating figure must announce that it is live.
