import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { HostShell } from '../../components/layout/HostShell';
import { BrandMark } from '../../components/game/AnswerShapeLogo';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { login, register, safeNext } from '../../lib/api';

type Field = 'email' | 'password' | 'displayName';

const FIELDS: Record<Field, { label: string; type: string; autoComplete: Record<'login' | 'register', string> }> = {
  displayName: { label: 'Display name', type: 'text', autoComplete: { login: 'nickname', register: 'nickname' } },
  email: { label: 'Email', type: 'email', autoComplete: { login: 'email', register: 'email' } },
  password: { label: 'Password', type: 'password', autoComplete: { login: 'current-password', register: 'new-password' } },
};

/** Shared card for LoginPage and RegisterPage. */
export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [values, setValues] = useState<Record<Field, string>>({ email: '', password: '', displayName: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === 'register';
  const fields: Field[] = isRegister ? ['displayName', 'email', 'password'] : ['email', 'password'];
  const otherHref = `${isRegister ? '/login' : '/register'}${next !== '/quizzes' ? `?next=${encodeURIComponent(next)}` : ''}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (isRegister) await register(values.email, values.password, values.displayName);
      else await login(values.email, values.password);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setBusy(false);
    }
  };

  return (
    <HostShell nav={false}>
      <div className="m-auto w-full max-w-md motion-safe:animate-fade-up">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandMark className="h-12 w-12" />
          <p className="mt-3 text-sm font-semibold uppercase tracking-widest text-brand-300">Live Quiz</p>
          <h1 className="mt-1 font-display text-4xl font-bold">{isRegister ? 'Create your host account' : 'Host log in'}</h1>
        </div>
        <Card className="bg-cream text-ink">
          <form onSubmit={submit} className="flex flex-col gap-4">
            {fields.map((f) => (
              <div key={f}>
                <label htmlFor={`auth-${f}`} className="mb-1 block text-sm font-semibold text-ink-muted">
                  {FIELDS[f].label}
                </label>
                <Input
                  id={`auth-${f}`} name={f} type={FIELDS[f].type} required
                  autoComplete={FIELDS[f].autoComplete[mode]}
                  minLength={f === 'password' && isRegister ? 8 : undefined}
                  maxLength={f === 'displayName' ? 40 : f === 'password' ? 128 : 254}
                  value={values[f]}
                  onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
                />
                {f === 'password' && isRegister && <p className="mt-1 text-xs text-ink-muted">At least 8 characters.</p>}
              </div>
            ))}
            {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</p>}
            <Button type="submit" size="lg" disabled={busy} className="mt-1">
              {isRegister ? 'Create account' : 'Log in'}
            </Button>
          </form>
        </Card>
        <p className="mt-6 text-center text-brand-200">
          {isRegister ? 'Already have an account? ' : 'New here? '}
          <Link to={otherHref} className="font-semibold text-cream underline underline-offset-4">
            {isRegister ? 'Log in' : 'Create an account'}
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-brand-300">
          Joining a game as a player? <Link to="/join" className="underline underline-offset-4">Enter a PIN</Link>
        </p>
      </div>
    </HostShell>
  );
}
