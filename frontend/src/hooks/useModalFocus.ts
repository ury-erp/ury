import { useEffect, useRef } from 'react';

const modalStack: HTMLElement[] = [];
let savedBodyOverflow = '';
const focusableSelector =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keep focus stable while fields rerender, and let only the top modal handle keys. */
export function useModalFocus(isOpen: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const panel = panelRef.current;
    if (!isOpen || !panel) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (modalStack.length === 0) {
      savedBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    modalStack.push(panel);
    panel.focus();
    const isTop = () => modalStack[modalStack.length - 1] === panel;
    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((element) => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true');
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTop() || event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      const active = document.activeElement;
      if (!first) {
        event.preventDefault();
        panel.focus();
      } else if (event.shiftKey && (active === first || active === panel || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || active === panel || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    const handleFocus = (event: FocusEvent) => {
      if (isTop() && !panel.contains(event.target as Node)) panel.focus();
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocus);
    return () => {
      const wasTop = isTop();
      const index = modalStack.indexOf(panel);
      if (index >= 0) modalStack.splice(index, 1);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocus);
      if (modalStack.length === 0) document.body.style.overflow = savedBodyOverflow;
      if (wasTop && previous?.isConnected) previous.focus();
    };
  }, [isOpen]);

  return panelRef;
}
