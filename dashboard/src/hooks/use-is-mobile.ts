/**
 * use-is-mobile.ts — Reactive viewport breakpoint hook.
 *
 * Returns `true` while the viewport is below Tailwind's `md` breakpoint
 * (768px). Used to decide between the WhatsApp-Web two-pane desktop layout
 * and the mobile slide-over Sheet.
 *
 * Lint note (react-hooks/set-state-in-effect): state is seeded with a lazy
 * initializer that reads matchMedia, and updated only from the `change`
 * listener (an event callback) — never directly inside the effect body.
 */

import { useEffect, useState } from 'react';

// Below Tailwind `md` (>=768px). Matches the `md:` breakpoints in chat-page.
const MOBILE_QUERY = '(max-width: 767px)';

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.matchMedia(MOBILE_QUERY).matches
      : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
