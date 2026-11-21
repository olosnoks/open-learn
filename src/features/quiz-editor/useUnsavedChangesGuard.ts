import { useEffect } from 'react';

const MESSAGE = 'You have unsaved changes. Leave without saving?';

/**
 * Warns before the host loses unsaved edits:
 * - closing / reloading the tab (beforeunload), and
 * - clicking any same-origin link to another path (the HostShell nav, for example).
 *
 * The app uses <BrowserRouter>, so react-router's useBlocker (data routers only) is not
 * available; a capture-phase click listener on the document runs before React Router's
 * own Link handler and can cancel it. Programmatic navigate() calls (after a successful
 * save) are never intercepted. Browser back/forward is not guarded.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = MESSAGE; // legacy browsers need a string
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!window.confirm(MESSAGE)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);
}
