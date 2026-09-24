import { useEffect, useState } from 'react';

/**
 * Viewport classes the cashier POS is laid out for.
 *
 * These are not arbitrary breakpoints: they come from the device matrix in
 * `docs/design/UX_UI_REDESIGN_PLAN_AR.md` §9, which names landscape tablets
 * (1024×768, 1280×800) and portrait tablets (768×1024, 820×1180) as targets
 * the POS has to work on. Everything below a portrait tablet is a phone,
 * which the cashier surface is still not designed for.
 *
 * - `phone`   (<768px)       — blocked; the captain surface serves this size.
 * - `compact` (768–1023px)   — portrait tablet: one column, order as a sheet.
 * - `medium`  (1024–1279px)  — landscape tablet: docked panels, tighter.
 * - `wide`    (>=1280px)     — counter screen: the full three-column layout.
 */
export type ViewportClass = 'phone' | 'compact' | 'medium' | 'wide';

export const POS_MIN_WIDTH = 768;

export function classifyWidth(width: number): ViewportClass {
  if (width < POS_MIN_WIDTH) return 'phone';
  if (width < 1024) return 'compact';
  if (width < 1280) return 'medium';
  return 'wide';
}

/**
 * Width alone, watched cheaply.
 *
 * `matchMedia` would need one listener per boundary and still has to be
 * re-read on orientation change, so a single resize listener that classifies
 * the width is both shorter and easier to reason about. State is only pushed
 * when the *class* changes, so dragging a window edge does not re-render the
 * menu grid on every pixel.
 */
export function useViewportClass(): ViewportClass {
  const [viewport, setViewport] = useState<ViewportClass>(() =>
    classifyWidth(typeof window === 'undefined' ? 1280 : window.innerWidth)
  );

  useEffect(() => {
    const read = () => {
      const next = classifyWidth(window.innerWidth);
      setViewport((current) => (current === next ? current : next));
    };
    read();
    window.addEventListener('resize', read);
    window.addEventListener('orientationchange', read);
    return () => {
      window.removeEventListener('resize', read);
      window.removeEventListener('orientationchange', read);
    };
  }, []);

  return viewport;
}

/**
 * Does the order / details panel stay docked beside the content?
 *
 * Below 1024px it cannot: a 384px panel over a 768px screen leaves no room
 * to read the menu, so the panel becomes a sheet the user opens from a
 * summary bar instead.
 */
export function useDockedPanels(): boolean {
  const viewport = useViewportClass();
  return viewport === 'medium' || viewport === 'wide';
}
