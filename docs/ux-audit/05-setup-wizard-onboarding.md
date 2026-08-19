# 05 — Setup Wizard & Onboarding

`frontend/src/components/setup/`, `frontend/src/pages/Setup/`. The first ten minutes of the product's life. Nothing else in the app gets a second chance to make this impression.

---

### SU-01 — Two steps, always visible, with a clear finish line
**Good** · S3
**Evidence:** `frontend/src/components/setup/WizardLayout.tsx:40-47`, `83-104`

**What's happening:** a two-step breadcrumb (Setup → Configure) with three explicit states — `active` (ringed), `done` (check icon), `upcoming` (muted) — a persistent sticky footer with Previous/Next, and a `secondaryAction` slot documented as being for a de-emphasised "Just show me a demo" link.

**Why it matters:** two steps is the right number — short enough that the end is visible from the start, which is the single biggest predictor of wizard completion. The distinct `done` state (a check, not just a colour) is correct and colour-independent. And the fact that the layout reserves a slot for a low-commitment escape hatch shows someone thought about the user who isn't ready to configure a restaurant yet; that path is usually the difference between an evaluation that continues and one that doesn't.

**Targeted action:** none.

**Regression check:** the breadcrumb is `hidden sm:flex` (line 41) — see SU-04.

---

### SU-02 — The brand logo is a camera-roll filename
**Bad** · S2
**Evidence:** `frontend/src/components/setup/WizardLayout.tsx:4` — `import uryLogo from '../../../Public/photo_2026-08-19_13-24-09.jpg'`; asset at `frontend/Public/photo_2026-08-19_13-24-09.jpg`

**What's happening:** the logo rendered at the top of the very first screen the customer ever sees is imported from a file named after the moment someone's phone or screenshot tool saved it. It is also a **JPEG**, rendered at `h-7` (28px).

**Why it matters:** three things, in increasing order of seriousness.
1. It signals provisionality at the exact moment the product is asking to be taken seriously. Filenames leak — into build output, into source maps, into any error overlay.
2. A JPEG logo at 28px on a `bg-card` surface will show compression artefacts and a slightly-off background edge, because JPEG has no transparency. Whatever near-white the source had will not be `--card` white.
3. It cannot scale for retina or dark mode, and it cannot be recoloured.

Also note the directory is `Public/` with a capital P (`frontend/Public/`), which is not Vite's `public/` convention — on a case-insensitive dev machine (macOS) this works and on a case-sensitive CI box it may not.

**Better:**
```diff
- import uryLogo from '../../../Public/photo_2026-08-19_13-24-09.jpg'
+ import uryLogo from '../../assets/ury-logo.svg'
- <img src={uryLogo} alt="URY Logo" className="h-7 w-auto" />
+ <img src={uryLogo} alt="URY" className="h-7 w-auto" />
```
(`alt="URY Logo"` also reads as "URY Logo image" to a screen reader — the word "logo" is noise in alt text.)

**Targeted action:** commit a real SVG under `src/assets/`, rename the import, delete the JPEG and `URY-bg.png` if unused. Check the `Public` vs `public` casing while you're there.

**Regression check:** grep for both asset filenames before deleting — `URY-bg.png` may be referenced from CSS rather than an import, which a JS-only grep will miss. Verify the build output still inlines/hashes the new asset.

---

### SU-03 — The version string falls back to a hardcoded lie
**OK** · S3
**Evidence:** `frontend/src/components/setup/WizardLayout.tsx:29` — `const version = (window as any).frappe?.boot?.versions?.ury || 'v3.2.0'`

**What's happening:** when the Frappe boot object is unavailable, the footer confidently displays `URY · v3.2.0`.

**Why it matters:** a version number's only job is to be true. A hardcoded fallback means the footer states a specific version that may be wrong by several releases, and it is precisely the string a customer will read back during a support call. Wrong version information sends support down the wrong path — strictly worse than no version.

**Better:**
```diff
- const version = (window as any).frappe?.boot?.versions?.ury || 'v3.2.0'
+ const version = (window as any).frappe?.boot?.versions?.ury ?? null
...
- <div>URY · {version}</div>
+ <div>URY{version ? ` · ${version}` : ''}</div>
```

**Targeted action:** drop the fallback. If a build-time version is wanted, inject `import.meta.env.VITE_APP_VERSION` from `package.json` at build — true by construction.

**Regression check:** none; the footer is decorative. Confirm no test asserts the literal `v3.2.0`.

---

### SU-04 — The step indicator disappears on the screen sizes that need it most
**OK** · S2
**Evidence:** `WizardLayout.tsx:41` — `className="hidden sm:flex items-center gap-2"`

**What's happening:** the Setup → Configure breadcrumb is hidden below the `sm` breakpoint (640px).

**Why it matters:** "where am I and how much is left" is the most valuable thing on a wizard screen, and it is dropped exactly where vertical space is tightest and the user can see the least of the form. The desktop user, who can see the whole flow, keeps the indicator; the phone user, who cannot, loses it. That is backwards. Restaurant owners doing first-run setup on a phone or a small tablet is not an edge case.

**Better:** don't hide it, shrink it. A one-line `Step 1 of 2 · Setup` at `text-xs` costs ~90px of header width and preserves the whole function.
```diff
- <div className="hidden sm:flex items-center gap-2">
-   <BreadcrumbStep label="Setup" … /> …
- </div>
+ <div className="hidden sm:flex items-center gap-2">…</div>
+ <span className="sm:hidden text-xs font-medium text-muted-foreground">
+   Step {step} of 2 · {step === 1 ? 'Setup' : 'Configure'}
+ </span>
```

**Regression check:** the header is a 3-column flex with `h-16` and `gap-4`; the mobile string must not push the logo+tagline (`"Let's get your restaurant ready"`, line 38) into a wrap. That tagline is itself long for a narrow header — consider hiding *it* below `sm` instead, since it is decorative and the step indicator is not.

---

### SU-05 — The progress modal is undismissible, unannounced, and has no recovery
**Bad** · S1
**Evidence:** `frontend/src/components/setup/ProgressModal.tsx:64-117`

**What's happening:** a full-screen `fixed inset-0` overlay with a segmented bar and a per-step list driven by realtime `ury_setup_progress` events. It has no `role="dialog"`, no `aria-live` on the step list, no close affordance, and no Escape. When `error` is set, a red box appears **inside the still-undismissible modal** with no Retry and no Close (lines 110-114).

**Why it matters:** the realtime-subscription ordering is genuinely careful — it subscribes *before* signalling the parent to start the API call (lines 50-58, with a comment explaining the race it avoids). That care makes the failure path's omission more conspicuous. If setup fails — and first-run setup is the single most failure-prone operation in any self-hosted product — the customer is left staring at a modal they cannot close, describing an error they cannot act on, on their first ten minutes with the product. The only exit is a browser refresh, and after a refresh they have no idea what state their installation is in.

Second: a screen reader user gets nothing. Steps advance silently; the operation appears to hang.

**Better:**
```tsx
<div role="dialog" aria-modal="true" aria-labelledby="setup-progress-title" aria-busy={!error}>
  <h2 id="setup-progress-title">Setting up your restaurant</h2>
  <ol aria-live="polite">   {/* each step change is announced */}
    …<li aria-current={isActive ? 'step' : undefined}>{step}</li>
  </ol>
  {error && (
    <>
      <div role="alert" className="…">{error}</div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Close</Button>
        <Button onClick={onRetry}>Try again</Button>
      </DialogFooter>
    </>
  )}
</div>
```
And state what a failure means for the data: "Nothing was changed — you can safely try again", or "Steps 1-3 completed; retrying will resume from step 4". Not knowing whether a half-finished setup is safe to retry is the actual anxiety.

**Targeted action:** add `role`/`aria-live`; add Retry + Close on error only (keep it undismissible while genuinely working — that part is correct); add a copy line about the state of a failed run.

**Regression check:** the `useEffect` unsubscribes on `visible` toggling (line 59), so a Close that flips `visible` to false will correctly tear down the socket subscription. Make sure `onRetry` re-mounts the subscription **before** re-firing the API — the existing `onReady` ordering exists precisely to guarantee that, so route retry through the same path rather than calling the API directly. Also confirm `activeIndex` resets on retry, or the second run starts mid-bar.

---

### SU-06 — Copy in the progress modal is duplicated and mispunctuated
**Bad** · S3
**Evidence:** `ProgressModal.tsx:79-82`

**What's happening:**
```
Setting up your restaurant
Setting things up ,this usually takes less than a minute.
```
The subtitle restates the heading, and the comma is on the wrong side of the space — `up ,this`.

**Why it matters:** a misplaced comma on the first screen of a paid product is a disproportionate signal; people generalise from typography to engineering quality, fairly or not. And a subtitle that repeats the heading spends the user's attention to say nothing, when it has exactly one useful job: set the expectation for the wait.

**Better:**
```diff
- <p>Setting things up ,this usually takes less than a minute.</p>
+ <p>This usually takes less than a minute. You can leave this page open.</p>
```

**Targeted action:** rewrite the subtitle to carry only new information. Run a copy pass over all the setup section files while you're in there.

**Regression check:** none.
