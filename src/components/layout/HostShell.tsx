import { NavLink, useNavigate } from 'react-router-dom';
import { useCurrentUser } from '../../features/auth/currentUser';
import { logout } from '../../lib/api';
import { cn } from '../../lib/cn';
import { BrandMark } from '../game/AnswerShapeLogo';

const links = [
  { to: '/quizzes', label: 'Quizzes' },
  { to: '/host/create', label: 'Start a game' },
  { to: '/sessions', label: 'Past games' },
];

/**
 * Dark green shell for every host page. `nav={false}` for the live game (projector).
 * `wide` relaxes the content width for the projector screens.
 */
export function HostShell({ children, nav = true, wide = false }: { children: React.ReactNode; nav?: boolean; wide?: boolean }) {
  const user = useCurrentUser();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const width = wide ? 'max-w-7xl' : 'max-w-6xl';

  return (
    <div className="host-backdrop min-h-dvh text-cream">
      {nav && (
        <nav className={cn('mx-auto flex flex-wrap items-center gap-x-6 gap-y-3 px-6 pt-5 text-sm font-semibold md:px-8', width)}>
          <span className="mr-auto inline-flex items-center gap-2 uppercase tracking-widest text-brand-300">
            <BrandMark className="h-5 w-5" />
            OpenLearn
          </span>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end
              className={({ isActive }) => cn(
                'rounded-lg px-1 py-0.5 transition-colors',
                isActive ? 'text-cream underline decoration-brand-300 decoration-2 underline-offset-[6px]' : 'text-brand-200 hover:text-cream',
              )}>
              {l.label}
            </NavLink>
          ))}
          {user && (
            <span className="flex items-center gap-3 border-l border-brand-500/60 pl-6">
              <span className="text-cream" data-testid="current-user">{user.displayName}</span>
              <button type="button" onClick={onLogout}
                className="rounded-lg border border-brand-300/70 px-3 py-1 text-brand-200 transition-colors hover:border-cream hover:text-cream">
                Log out
              </button>
            </span>
          )}
        </nav>
      )}
      <main className={cn('mx-auto flex min-h-dvh flex-col px-5 py-8 md:px-8 md:py-10', width)}>{children}</main>
    </div>
  );
}
