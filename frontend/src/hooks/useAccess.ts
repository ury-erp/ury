import { useEffect, useState } from 'react';
import { getAccess, OPEN_ACCESS, type UryAccess } from '@ury/core';

/**
 * The signed-in user's Desk access and the switched-off features.
 * Starts permissive and narrows once loaded; the server enforces either way.
 */
export function useAccess(): { access: UryAccess; loaded: boolean } {
  const [access, setAccess] = useState<UryAccess>(OPEN_ACCESS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    getAccess().then((a) => {
      if (alive) {
        setAccess(a);
        setLoaded(true);
      }
    });
    return () => {
      alive = false;
    };
  }, []);
  return { access, loaded };
}
