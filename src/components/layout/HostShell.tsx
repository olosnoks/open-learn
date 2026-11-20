import { NavLink, useNavigate } from 'react-router-dom';
import { useCurrentUser } from '../../features/auth/currentUser';
import { logout } from '../../lib/api';

const links = [
  { to: '/quizzes', label: 'Quizzes' },
  { to: '/host/create', label: 'Start a game' },
  { to: '/sessions', label: 'Past games' },
];

export function HostShell({ children, nav = true }: { children: React.ReactNode; nav?: boolean }) {
  const user = useCurrentUser();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-dvh bg-brand-700 text-cream">
      {nav && (
        <nav className="mx-auto flex max-w-6xl items-center gap-6 px-8 pt-6 text-sm font-semibold">
          <span className="mr-auto uppercase tracking-widest text-brand-300">mscoding.org · Live Quiz</span>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end
              className={({ isActive }) => (isActive ? 'text-cream underline underline-offset-4' : 'text-brand-200 hover:text-cream')}>
              {l.label}
            </NavLink>
          ))}
          {user && (
            <span className="flex items-center gap-3 border-l border-brand-500 pl-6">
              <span className="text-cream" data-testid="current-user">{user.displayName}</span>
              <button type="button" onClick={onLogout}
                className="rounded-tile border border-brand-300 px-3 py-1 text-brand-200 hover:border-cream hover:text-cream">
                Log out
              </button>
            </span>
          )}
        </nav>
      )}
      <main className="mx-auto flex min-h-dvh max-w-6xl flex-col px-8 py-10">{children}</main>
    </div>
  );
}
