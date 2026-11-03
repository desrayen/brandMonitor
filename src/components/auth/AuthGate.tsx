import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Eye, Instagram, Loader2, LogOut } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { AccessContext, type Access } from '@/lib/access';

const SUPABASE_URL = (import.meta.env.NEXT_PUBLIC_SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const SUPABASE_KEY = import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
const isGuestSession = (s: Session | null) => Boolean(s?.user.app_metadata?.view_key_id);

// Exchange a ?view_key= link for a read-only guest session.
async function redeemViewKey(key: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/view-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: SUPABASE_KEY },
    body: JSON.stringify({ view_key: key }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.token_hash) return body.error ?? 'This link is not valid.';
  await supabase.auth.signOut({ scope: 'local' });
  const { error } = await supabase.auth.verifyOtp({ token_hash: body.token_hash, type: 'magiclink' });
  return error ? error.message : null;
}

type View = 'login' | 'forgot' | 'set-password';

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>(() => (/type=(recovery|invite)/.test(window.location.hash) ? 'set-password' : 'login'));
  const [access, setAccess] = useState<Access | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const userId = session?.user.id;

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    (async () => {
      const key = new URLSearchParams(window.location.search).get('view_key');
      if (key) {
        const { data } = await supabase.auth.getSession();
        // a team member opening a share link keeps their own (full) session
        if (!data.session || isGuestSession(data.session)) {
          const err = await redeemViewKey(key);
          if (err) setLinkError(err);
        }
        window.history.replaceState(null, '', '/');
      }
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setLoading(false);
    })();
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setView('set-password');
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setAccess(null);
    if (!userId) return;
    supabase.rpc('my_view_access').then(({ data, error }) => {
      const a = (data ?? {}) as Partial<Access>;
      setAccess(error ? { guest: false, member: false, admin: false, pages: [] } : { guest: !!a.guest, member: !!a.member, admin: !!a.admin, pages: a.member ? ['hm', 'kol', 'threads', 'gsc', 'fyp'] : (a.pages ?? []), label: a.label });
    });
  }, [userId]);

  if (loading || (session && !access && view !== 'set-password')) {
    return <div className="auth-screen"><Loader2 className="auth-spin" size={20} /></div>;
  }
  if (!isSupabaseConfigured) {
    return <AuthCard title="Almost there" subtitle="The dashboard isn't connected yet. Please contact your administrator to finish the setup." />;
  }
  if (!session || view === 'set-password') {
    if (view === 'set-password' && session) return <SetPasswordForm onDone={() => setView('login')} />;
    if (view === 'forgot') return <ForgotForm onBack={() => setView('login')} />;
    return <LoginForm onForgot={() => setView('forgot')} notice={linkError} />;
  }
  if (!access) return null;
  if (!access.member && (!access.guest || access.pages.length === 0)) {
    return <AuthCard title={access.guest ? 'This link no longer works' : 'No access yet'} subtitle={access.guest ? 'The shared link was revoked or has expired. Ask the owner for a new one.' : 'Your account is not part of the Brand Monitor team. Ask an admin to give you access.'}>
      <button className="auth-primary" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </AuthCard>;
  }

  return <AccessContext.Provider value={access}>
    {children}
    {access.guest
      ? <button className="auth-signout" onClick={() => supabase.auth.signOut()} title="Leave the shared view">
          <Eye size={14} /><span>View only{access.label ? ` · ${access.label}` : ''}</span><LogOut size={13} />
        </button>
      : <button className="auth-signout" onClick={() => supabase.auth.signOut()} title={session.user.email ?? 'Sign out'}>
          <LogOut size={14} /><span>Sign out</span>
        </button>}
  </AccessContext.Provider>;
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

function LoginForm({ onForgot, notice }: { onForgot: () => void; notice?: string | null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(notice ?? null);

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
