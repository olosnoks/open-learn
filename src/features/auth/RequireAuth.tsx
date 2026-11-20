import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { HostShell } from '../../components/layout/HostShell';
import { getMe, loginPath, type Me } from '../../lib/api';
import { CurrentUserContext } from './currentUser';

/**
 * Layout route for host-only pages. Checks /api/auth/me once when entering the host
 * area and redirects to /login?next=… if not signed in. Expired sessions met later
 * are handled by src/lib/api.ts, which redirects on any 401.
 */
export function RequireAuth() {
  const location = useLocation();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; user: Me | null }>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((user) => { if (!cancelled) setState({ status: 'ready', user }); })
      .catch((e: Error) => { if (!cancelled) setState({ status: 'error', message: e.message }); });
    return () => { cancelled = true; };
  }, []);

  if (state.status === 'loading') return <HostShell nav={false}><p>Loading…</p></HostShell>;
  if (state.status === 'error') {
    return <HostShell nav={false}><p role="alert">Couldn't check your sign-in: {state.message}</p></HostShell>;
  }
  if (!state.user) return <Navigate to={loginPath(location.pathname + location.search)} replace />;
  return (
    <CurrentUserContext.Provider value={state.user}>
      <Outlet />
    </CurrentUserContext.Provider>
  );
}
