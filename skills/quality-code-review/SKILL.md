---
name: quality-code-review
description: >-
  Review code for any Frappe application — a checklist distilled from years of
  engineering practice on correctness, security, performance, concurrency,
  readability, API design, and testing. Use this when reviewing a diff, a PR, or
  a piece of code for quality and security, or when you want a reviewer's
  checklist grounded in hard-won Frappe/ERPNext lessons.
---

# Quality Code Review

A reviewer's checklist for Frappe applications. Protect **correctness, security,
and the future maintainer**, in that order of consequence — lead with the
highest-consequence checks. Prefer a root-cause fix over a workaround, and say
*why* a finding matters (what breaks, for whom).

Review order: **§1 Correctness** and **§2 Security** first (spend most attention
here) → **§3 Performance**, **§4 Concurrency** (bugs invisible in a casual read)
→ **§5 Readability**, **§6 API design**, **§7 Testing**, **§8 Errors &
observability**.

---

## 1. Correctness & stability (highest consequence)

The worst bug is **silent stateful corruption** — wrong ledgers/stock posted
with no error. Treat stateful and legal/accounting/compliance code as **"failure
is not an option"** code.

- **Fail early and loudly.** Use assertions for internal invariants:
  `assert total_credit == total_debit`. (Assertions are for invariants the code
  guarantees — not user-facing validation.)
- **Picture how it breaks.** For every change ask: *Where can this break? How
  will someone misuse this?* Write fool-proof code. Extensions and overrides
  should especially consider handling all sorts of failure modes.
- **No partial commits.** A stray `frappe.db.commit()` / `db.rollback()`
  mid-transaction ends the transaction and exposes partial state — flag every
  one. Submitting/saving with validation bypassed (docs posted with no SL/GL
  entry when validation fails) is a critical bug.
- **Don't sacrifice atomicity for convenience** (e.g. adding `autocommit` to fix
  bootstrapping makes transactions non-atomic). Autocommit belongs only on schema
  creation.
- **Preserve invariants over UX.** "Compromise UX, but guarantee correctness."
  Don't degrade working code to accommodate broken code.
- **Validate the issue before fixing it.** Sometimes the correct fix is "don't
  fix this". Identify the root causes first.
- **Watch for destructive DB APIs with empty/`None` filters.**
  `set_value("Site", None, ...)` / `db.delete` with no filter updates/deletes
  *every* row. These must error, not silently operate on the whole table. Flag
  any `set_value`/`delete`/`get_value` where the name/filter could be `None` or
  empty- or attacker-controlled.
- **Never mutate a list/dict while iterating it.** Removing or adding to a
  collection mid-loop raises `RuntimeError` or silently skips items — iterate a
  copy, `reversed()`, or build a new list.
- **No mutable default arguments.** `def f(items=[])` / `={}` shares one object
  across every call — use `None` with a guard inside.
- **Check the types in a condition actually match.** A comparison between
  mismatched types (string vs `datetime`, string vs int) silently never matches
  or is always true — cast explicitly (`cint`/`flt`) at the boundary.
- **Question the return shape.** Before indexing a result, ask whether it can be
  `None` / `[None, None]`; watch `as_dict=1` (list of dicts) vs scalar confusion.
- **Don't silently change long-standing semantics.** Behavior callers have relied
  on for a long time is a contract — altering it is a breaking change in disguise,
  even when no signature changed.

## 2. Security

Avoiding a vulnerability is far easier than fixing one safely. Audit
security-critical code (auth, authorization, permissions, user management)
especially hard.

**Injection**
- NEVER build SQL by string concatenation/f-strings. Use the ORM or query
  builder. If raw SQL is unavoidable, use parameter substitution
  (`frappe.db.sql("... where name = %s", (user,))`) — never interpolate yourself.
  Better still, **avoid introducing new raw SQL at all**: beyond injection risk it
  ties code to one database, and the framework aims to stay DB-agnostic (Postgres
  support). Prefer `frappe.qb`.
- **Type confusion is an injection vector even with the ORM.** Frappe accepts
  complex types, so a parameter expected to be a string can arrive as a filter
  list: `{"key": ["!=", ""]}` passed to `db.get_value` bypasses a secret-key
  check. **Validate input *types* at trust boundaries** — explicit
  `isinstance(key, str)`. Audit every `@frappe.whitelist` method for this.
- Never `eval`/`exec` anything yourself. `safe_eval`/`safe_exec` only, in limited
  volume, and "safe_exec is not magic." Never accept a client-supplied method
  path to execute.

**Sandboxing & trust boundaries**
- Sandboxed execution (RestrictedPython/`safe_exec`) is not reliably safe —
  assume escapes exist. Security toggles must live at the **right trust
  boundary**: server-script enablement is a *bench*-level config, never
  site-level (a tenant could enable it and take over the whole server).
- Prefer **allowlists over blocklists** — blocklists are bypassable. Don't
  expose everything by default.

**Access control**
- "Think 10 times before `allow_guest=True`" — it is not a shortcut around real
  authn/authz. Web pages must apply permissions *before* reading/sharing data.
  Prefer `get_list`/`get_all` over hand-rolled queries.
- **Scope relaxations precisely.** Verify a rate-limit/permission exception
  targets exactly the intended principal — not, say, all non-guest users.

**Path traversal / filesystem**
- Prefer the File doctype API. If user input enters a path, ensure it can't
  traverse (`/../../`) outside the site folder.

**Crypto / secrets**
- Never roll your own crypto; reuse existing implementations. Verify authenticity
  of guest/webhook requests (HMAC).
- Signed/one-time URLs: use a truly secret signing value; expire by **both** time
  and first use; **validate using the URL alone, not merged form data** (Frappe
  merges URL + form data → replay attacks with one valid signature).
- Store secrets in password fields; never plain text; never leak secrets in logs
  or error messages.

**XSS & the rest of OWASP**
- Don't inject user input into the DOM. Treat XSS as critical even when it looks
  trivial — HTML/JS injection usually leads to account hijack.
- Don't fix XSS by sanitizing and throwing away special characters. Prefer escaping right before injecting values in DOM.

## 3. Performance is correctness

The cheapest time to fix performance is at review; slow code merged sits
undetected for years. Performance is a feature (Doherty threshold; humans
perceive ~100ms).

- **Budgets:** common reads < 100ms; reads < 1s; most writes < 5s; **never**
  exceed ~10s. P99 of a frequent read-only request should be ~1s. A slow
  synchronous request blocks a worker (head-of-line blocking).
- **Complexity rule:** a frequently-called endpoint must do O(1) or O(log N)
  work — a large constant factor at worst, never O(N). Counting rows is O(N), not
  O(1); `COUNT(*)` over a large/filtered table is expensive. Bound unbounded
  scans (e.g. last 3 months, a "1000+" sentinel) rather than scanning everything.
- **Indexes are code.** Flag any `WHERE`/join/filter on an unindexed column.
  Indexes (and custom indexes) must be **committed in code**, not applied ad-hoc
  — they get lost on migration otherwise. Form loads that pull
  comments/versions/assignments need *all* those queries indexed; one unindexed
  query makes everything sluggish.
- **No DB calls in loops.** "Don't write validations that call db in LOOPS." Flag
  N+1 patterns. Cache stable values (UOM, docstatus, status) instead of
  re-querying. This is acceptable in background jobs, but never in requests.
- **The Remove → Reduce → Reuse ladder** for slow code you can't fix: remove it,
  invoke it less, or memoize. Pick the right cache scope (
  `@redis_cache`, `@request_cache`, `@site_cache` — the last balloons memory if
  overused). DO NOT hand-roll caches in `frappe.local` or `frappe.flags`:
  "you'll just be creating brand-new cache-invalidation bugs." Don't cache
  trivially cheap work.
- **Memory:** don't stuff junk into shared module-level files / `__init__.py` /
  class-level state — it stays resident forever. Remove unused module-level
  imports (move into the function that uses them). Watch for leaks.
- **Reorder conditionals so the DB call is last.** In a boolean expression, put
  cheap in-memory checks first so short-circuiting can skip the query entirely.
- **Aggregate in SQL, not Python.** Use `SUM()`/`COUNT()` in the query instead of
  fetching all rows to reduce them in memory; push filters into the subquery so
  they apply *before* the join.
- **Don't fetch a whole doc for one value.** Use `get_value`/`get_single_value`/
  `set_value` for a single column instead of `get_doc().save()`; use
  `frappe.delete_doc` instead of `get_doc().delete()` (which fetches the doc only
  to delete it).
- **No MyISAM tables in hot paths.** Reading a MyISAM table takes an implicit
  table-level lock — never touch one in a request path.
- **Move long work to a background queue.** Long-running work belongs in
  `enqueue(..., queue="long")`, not a synchronous request that blocks a worker.

## 4. Concurrency

- **Check-then-act is a race.** `if not frappe.db.exists(...): insert()` — two
  workers both see "not exists" and both insert. Prefer a **DB-level unique
  constraint**; "outsource integrity to the database."
- **Locking footguns:** `SELECT ... FOR UPDATE` on an unindexed query locks every
  scanned row (and gaps) — always ensure the filter uses an index, or you lock
  the whole table. Locking a parent but not its children yields a "mutant" doc.
- **Global mutable state / class attributes are global in Python** — a shared
  engine/class attribute leaking query state across concurrent requests produces
  garbage. Make query-building **stateless**. Don't do "weird shit with
  `frappe.local`" — `local` is for variables, not static state.

## 5. Readability & maintainability

~50% of dev time is spent reading code; rotten code eventually forces a rewrite.

- **Keep functions pure when they can be pure** — easy to read and test.
- **Don't pass mutable objects around to be filled in** ("assembly" code) —
  return new values. Passing a mutable to be mutated forces a reader to open two
  files to understand one thing.
- A function that mutates its input must be named appropriately.
- **Prefer the boring construct.** While that functional map-reduce one-liner
  looks beautiful, please just write a 4-line for-loop. Favor debuggable code
  over clever code.
- **Consistency over personal style.** A codebase shouldn't be a hodge-podge of
  10 styles. Match the surrounding formatting/naming/import conventions; flag a
  change that breaks them.
- **Good taste:** restructure so the edge case becomes the common case, removing
  special-case branches. Ask: can this be simpler? Less code? Is it
  over-indented if-else soup?
- **Prefer extending shared components over copy-paste divergence.** 3–4 forked
  implementations of one thing → slow long-term velocity. Avoid tight coupling
  across modules; integrate through clear, documented public APIs.
- Document **public** modules/classes/functions with docstrings; **prefer type
  annotations over describing types in prose** ("type hints are 10x better");
  type checkers find non-obvious bugs.
- Docstrings should only mention important things. Keep them short and to the
  point. Don't explain what's trivially understood from function name. Focus on
  "why".
- **Guard clauses over nesting.** Prefer early-return guards to over-indented
  if-else soup; merge nested `if`s.
- **Delete dead code.** Commented-out code never gets merged — git history
  already keeps it.
- **Split unrelated changes** into separate commits/PRs — keeps review focused
  and `git blame`/reverts clean.

## 6. API design & backward compatibility

- **Principle of least astonishment:** an API's name + signature should convey
  ~90% of intent; users shouldn't be surprised by behavior.
- **Reject loose/overloaded parameters** that accept many disjoint types
  (string/dict/list/None). Prefer separate single-purpose functions. Beware
  implicit fallbacks; use explicit variants. "APIs whose correct use depends on
  tribal knowledge are a liability."
- **Build for extension, not override.** Provide hooks; never monkey-patch
  core at runtime ("inexcusably horrible" — breaks future fixes) and never copy a
  whole core file to change a few lines (fixes won't propagate).
- **Backward compatibility is an obligation** for mature/public APIs. Follow
  semver; **minor versions = zero breaking changes**. Breaking changes include:
  removing public functions/fields, reordering args, new mandatory args, changed
  business logic, moved/renamed files (broken imports), bumped shared deps.
  Renaming without keeping the old name as an alias is an *unnecessary* break.
  Every breaking change ships a deprecation warning + docs.
- **Watch for schema breaking-change footguns:** adding mandatory fields to
  existing sites, making long-lived fields unique (needs a data patch), changing
  field types without patches, removing fields.
- **Schema changes that silently skip existing sites need a data patch.** Single
  doctypes don't sync new-field defaults to existing sites, and a field-type
  change (e.g. text→int) doesn't convert existing values — both need an explicit
  patch, tested against a populated site.
- **New parameters go last as keyword args with safe defaults** (`None`, not
  `""`) so existing positional callers don't break. When renaming, keep the old
  name as a shim: `def old_name(...): return new_name(...)`.
- **Patch hygiene.** Data patches must be **idempotent** (safe to re-run),
  **correctly ordered** (run after the field/doctype they read exists), and live
  in the **right app** (a framework change is patched in the framework, not the
  downstream app).
- **A modified existing test is a red flag.** If making a change pass required
  editing an existing test's assertions, you've likely broken a real workflow —
  justify it explicitly rather than bending the test.

## 7. Testing

- **Each PR needs decent test coverage** — patch coverage on the diff, not just
  project coverage. (Frappe target: 85% covered lines in the diff.) Tests should
  capture the most-used business scenarios.
- **Regression test every fix.** A bug fix without a test that would have caught
  it invites the regression back. For extreme-consequence (stateful/compliance)
  code, go beyond examples — property-based testing (Hypothesis).
- **Flag missing migration/data-patch coverage.** Schema changes and data patches
  are the highest-risk, least-tested area; a change that alters fields or
  migrates data needs a patch tested against a realistic, populated site (empty
  tables always "migrate" successfully even when the change is invalid).
- **Tests must be deterministic and independent.** No `random` (flaky); no
  reliance on state left by other tests (order-dependence); use `freeze_time`
  for time-dependent logic.

## 8. Error messages, logging & observability

- **Error message quality is a legitimate review item.** Titles must be specific
  and Google-able (never "Message"/"Error"). Reference field names as fields.
  State *what changed*: the row, the field, and before→after values
  (`1 → 2`). The user must know "qty changed from what to what?"
- **Surface failures to the affected party** — "a broken email setup is the
  user's problem only if they know it's broken."
- **Log things.** Preserve tracebacks/exception context (orders of magnitude
  easier debugging). Log destructive/admin actions with attributable identity
  (who, when, from where), persisted outside ephemeral containers.
