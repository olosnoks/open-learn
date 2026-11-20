import { createContext, useContext } from 'react';
import type { Me } from '../../lib/api';

export const CurrentUserContext = createContext<Me | null>(null);

/** The signed-in host inside <RequireAuth>; null elsewhere (e.g. on the login page). */
export const useCurrentUser = () => useContext(CurrentUserContext);
