import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Instagram, Loader2, LogOut } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type View = 'login' | 'forgot' | 'set-password';

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>(() => (/type=(recovery|invite)/.test(window.location.hash) ? 'set-password' : 'login'));

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setView('set-password');
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="auth-screen"><Loader2 className="auth-spin" size={20} /></div>;
  }
  if (!isSupabaseConfigured) {
    return <AuthCard title="Setup needed" subtitle="Supabase keys are missing. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to the environment and redeploy." />;
  }
  if (!session || view === 'set-password') {
    if (view === 'set-password' && session) return <SetPasswordForm onDone={() => setView('login')} />;
    if (view === 'forgot') return <ForgotForm onBack={() => setView('login')} />;
    return <LoginForm onForgot={() => setView('forgot')} />;
  }

  return <>
    {children}
    <button className="auth-signout" onClick={() => supabase.auth.signOut()} title={session.user.email ?? 'Sign out'}>
      <LogOut size={14} /><span>Sign out</span>
    </button>
  </>;
}

function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return <div className="auth-screen">
    <div className="auth-card">
      <span className="auth-mark"><Instagram size={16} /></span>
      <h1>{title}</h1>
      {subtitle && <p className="auth-sub">{subtitle}</p>}
      {children}
    </div>
  </div>;
}

function LoginForm({ onForgot }: { onForgot: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message);
    setBusy(false);
  }

  return <AuthCard title="Brand Monitor" subtitle="Sign in to view the dashboard.">
    <form className="auth-form" onSubmit={submit}>
      <label>Email<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" /></label>
      <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
      {error && <p className="auth-error">{error}</p>}
      <button className="auth-primary" disabled={busy}>{busy ? <Loader2 className="auth-spin" size={14} /> : 'Sign in'}</button>
      <button type="button" className="auth-link" onClick={onForgot}>Forgot password?</button>
    </form>
    <p className="auth-foot">Access is invite-only. Ask an admin for an account.</p>
  </AuthCard>;
}

function ForgotForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    if (error) setError(error.message);
    else setSent(true);
    setBusy(false);
  }

  return <AuthCard title="Reset password" subtitle={sent ? 'If that email has an account, a reset link is on its way.' : 'We will email you a link to set a new password.'}>
    {!sent && <form className="auth-form" onSubmit={submit}>
      <label>Email<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      {error && <p className="auth-error">{error}</p>}
      <button className="auth-primary" disabled={busy}>{busy ? <Loader2 className="auth-spin" size={14} /> : 'Send reset link'}</button>
    </form>}
    <button type="button" className="auth-link" onClick={onBack}>Back to sign in</button>
  </AuthCard>;
}

function SetPasswordForm({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    window.history.replaceState(null, '', window.location.pathname);
    onDone();
  }

  return <AuthCard title="Set your password" subtitle="Choose a password for your Brand Monitor account.">
    <form className="auth-form" onSubmit={submit}>
      <label>New password<input type="password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
      <label>Confirm password<input type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
      {error && <p className="auth-error">{error}</p>}
      <button className="auth-primary" disabled={busy}>{busy ? <Loader2 className="auth-spin" size={14} /> : 'Save password'}</button>
    </form>
  </AuthCard>;
}
