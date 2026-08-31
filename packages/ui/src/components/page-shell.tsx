import * as React from "react"
import { cn } from "../lib/cn"

// Page/section shell, ported from `ury-pos.html`'s `.page`/`.sec`/`.sect`
// (see DENSITY_PLAN.md §1, §3, §5 T2). One `<Page>` per route, one
// `<Section>` per `.sec` block — a small, closed set of call sites where a
// shell can enforce rhythm that a token alone can't (a token is opt-in per
// call site; a shell physically can't be forgotten the way `space-y-section`
// can be typo'd back to `space-y-6`).

export interface PageProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * `.page`: `max-width:1440px; margin:0 auto; padding:20px 22px 34px`.
 * Bottom padding is the POS base value (34px) rather than the dashboard
 * mockup's 90px — see the `page-bottom` token comment in
 * tailwind-preset.js. A page that needs extra bottom clearance (e.g. for a
 * fixed footer) should override with its own `pb-*` className rather than
 * this component growing a prop for it.
 */
const Page = React.forwardRef<HTMLDivElement, PageProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "max-w-[1440px] mx-auto px-page-x pt-page-top pb-page-bottom",
        className
      )}
      {...props}
    />
  )
)
Page.displayName = "Page"

export interface SectionProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * `.sec`: `margin-top:24px` between stacked sections.
 *
 * First-child margin approach: every `<Section>` always carries `mt-section`
 * (rather than trying to conditionally suppress it on the first section in
 * a page), and the *page* is responsible for not needing a top gap before
 * its first section — in the mockup the first `.sec` sits directly under
 * `.stats`, which already carries its own `mb-stats-mb` (20px) below it, so
 * the visual gap before the first section is correct without `Section`
 * special-casing "am I first". This was chosen over a `[&>*+*]` sibling
 * selector or a `space-y-section` wrapper on `<Page>` because it keeps
 * `<Section>` self-contained and usable outside of a `<Page>` (e.g. nested
 * inside another layout) without depending on sibling context or a specific
 * parent wrapper class being present.
 */
const Section = React.forwardRef<HTMLDivElement, SectionProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("mt-section", className)} {...props} />
  )
)
Section.displayName = "Section"

export interface SectionHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

/** `.sect`: `margin-bottom:9px` — section header to section content. */
const SectionHeader = React.forwardRef<HTMLDivElement, SectionHeaderProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("mb-sect", className)} {...props} />
  )
)
SectionHeader.displayName = "SectionHeader"

const SectionWithHeader = Object.assign(Section, { Header: SectionHeader })

export { Page, SectionWithHeader as Section, SectionHeader }
