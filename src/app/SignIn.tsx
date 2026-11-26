import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Icon, type IconName } from '../ui/Icon';
import { Btn, Field, IBtn } from '../ui/kit';

type Mode = 'in' | 'up' | 'forgot' | 'confirm' | 'reset-sent';

const POINTS: [IconName, string, string][] = [
  ['hourglass', 'Guess', 'Give each task an estimate.'],
  ['timer', 'Time it', 'One countdown, on your phone or your PC.'],
  ['insights', 'Learn', 'See where your time really goes.'],
];

/** Sign in, create an account, or reset a password. Email + password only. */
export function SignIn({ signedOut }: { signedOut?: boolean }) {
  // a shared invite link (…/signup or ?signup) opens straight on "Create your account"
  const [mode, setMode] = useState<Mode>(() => (/^\/(signup|join|invite)\b/.test(location.pathname) || new URLSearchParams(location.search).has('signup') ? 'up' : 'in'));
  const [resent, setResent] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = (m: Mode) => {
    setMode(m); setErr(''); setResent(false);
    // keep the address bar honest, so a refresh (or a copied link) lands on the same screen
    try { history.replaceState(null, '', m === 'up' ? '/signup' : '/'); } catch { /* ignore */ }
  };
  const resend = async () => {
    setBusy(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: location.origin + '/my-day' } });
    setBusy(false);
    if (error) setErr(friendly(error.message)); else setResent(true);
  };
  const friendly = (m: string) => {
    const s = m.toLowerCase();
    if (s.includes('invalid login') || s.includes('invalid credentials')) return 'That email and password don’t match. Check them and try again.';
    if (s.includes('already registered') || s.includes('already been registered')) return 'There’s already an account with this email. Sign in instead.';
    if (s.includes('email not confirmed')) return 'Confirm your email first: open the link we sent you, then sign in.';
    if (s.includes('signups not allowed') || s.includes('signup is disabled')) return 'New accounts are switched off right now. Ask the person who invited you.';
    if (s.includes('password should be')) return 'Use at least 8 characters for your password.';
    if (s.includes('rate limit')) return 'Too many tries. Wait a minute and try again.';
    return m;
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr('');
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) setErr(friendly(error.message));
      } else if (mode === 'up') {
        if (password.length < 8) { setErr('Use at least 8 characters for your password.'); return; }
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { name: name.trim() }, emailRedirectTo: location.origin + '/my-day' } });
        if (error) setErr(friendly(error.message));
        else if (!data.session) go('confirm'); // email confirmation is on: the app opens after they click the link
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + '/my-day' });
        if (error) setErr(friendly(error.message)); else go('reset-sent');
      }
    } finally { setBusy(false); }
  };
  const canSubmit = mode === 'forgot' ? !!email.trim() : mode === 'up' ? !!(name.trim() && email.trim() && password) : !!(email.trim() && password);
  const title = { in: 'Welcome back', up: 'Create your account', forgot: 'Reset your password', confirm: 'Check your email', 'reset-sent': 'Check your email' }[mode];
  const sub = {
    in: 'Promise a time. Keep it. Learn when you don’t.',
    up: 'Free, and it takes a minute. Your tasks stay private to you.',
    forgot: 'We’ll email you a link to set a new one.',
    confirm: `We sent a link to ${email || 'your email'}. Open it on this device to finish signing up.`,
    'reset-sent': `If there’s an account for ${email || 'that email'}, a reset link is on its way. Open it on this device.`,
  }[mode];

  return (
    <div className="signin">
      <div className="signin-wrap">
        <aside className="signin-side">
          <div className="row gap-12"><span className="brand-logo" style={{ width: 48, height: 48, borderRadius: 14 }}><Icon name="timer" size={28} /></span><span className="t-tl">Ontrack</span></div>
          <h1 className="signin-claim">Get better at knowing how long work takes.</h1>
          <div className="col gap-16">
            {POINTS.map(([ic, t, s]) => (
              <div key={t} className="row gap-12" style={{ alignItems: 'flex-start' }}>
                <span className="signin-pt"><Icon name={ic} /></span>
                <span className="col"><span className="t-tm">{t}</span><span className="t-bm c-muted">{s}</span></span>
              </div>
            ))}
          </div>
        </aside>
        <form className="signin-card" onSubmit={submit} noValidate>
          <div className="row gap-12 signin-brand-sm"><span className="brand-logo" style={{ width: 40, height: 40, borderRadius: 12 }}><Icon name="timer" size={24} /></span><span className="t-tl">Ontrack</span></div>
          <div className="col gap-8"><span className="t-hm">{title}</span><span className="t-bl c-muted">{sub}</span></div>
          {signedOut && mode === 'in' && <div className="row gap-8 t-bm" style={{ background: 'var(--secondary-container)', color: 'var(--on-secondary-container)', borderRadius: 12, padding: '10px 14px' }}><Icon name="checkCircle" size={20} />You signed out. Your data stays saved.</div>}

          {(mode === 'confirm' || mode === 'reset-sent') ? (
            <>
              <div className="signin-mail"><Icon name="mail" size={40} /></div>
              {mode === 'confirm' && <span className="t-bs c-muted">Nothing after a few minutes? Check spam, or send it again.</span>}
              {err && <div className="row gap-8 t-bs c-error" role="alert"><Icon name="warn" size={18} />{err}</div>}
              {mode === 'confirm' && <Btn kind="outlined" disabled={busy || resent} onClick={resend}>{resent ? 'Sent again' : busy ? 'Sending…' : 'Send the link again'}</Btn>}
              <Btn big kind="tonal" onClick={() => go('in')}>Back to sign in</Btn>
            </>
          ) : (
            <>
              {mode === 'up' && <Field label="Your name" name="name" autoComplete="name" value={name} onChange={setName} placeholder="What should we call you?" autoFocus bg="var(--surface-lowest)" />}
              <Field label="Email" type="email" name="email" autoComplete={mode === 'up' ? 'email' : 'username'} value={email} onChange={setEmail} placeholder="you@example.com" autoFocus={mode !== 'up'} bg="var(--surface-lowest)" error={!!err} />
              {mode !== 'forgot' && (
                <Field label="Password" type={show ? 'text' : 'password'} name="password" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} value={password} onChange={setPassword} bg="var(--surface-lowest)" error={!!err}
                  placeholder={mode === 'up' ? 'At least 8 characters' : undefined}
                  trail={<IBtn sm icon={show ? 'eyeOff' : 'eye'} label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)} />} />
              )}
              {mode === 'up' && password && <PasswordMeter pw={password} />}
              {err && <div className="row gap-8 t-bs c-error" role="alert"><Icon name="warn" size={18} />{err}</div>}
              <Btn type="submit" big disabled={busy || !canSubmit}>
                {busy ? 'One moment…' : mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Send reset link'}
              </Btn>
              {mode === 'in' && <button type="button" className="link-btn" style={{ alignSelf: 'center' }} onClick={() => go('forgot')}>Forgot password?</button>}
              {mode === 'forgot' && <button type="button" className="link-btn" style={{ alignSelf: 'center' }} onClick={() => go('in')}>Back to sign in</button>}
            </>
          )}
          <div className="signin-switch t-bm">
            {mode === 'up' ? <>Already have an account? <button type="button" className="link-btn" onClick={() => go('in')}>Sign in</button></>
              : <>New to Ontrack? <button type="button" className="link-btn" onClick={() => go('up')}>Create an account</button></>}
          </div>
        </form>
      </div>
    </div>
  );
}

/** a quick, honest strength hint while choosing a password */
function PasswordMeter({ pw }: { pw: string }) {
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^\w\s]/].filter(r => r.test(pw)).length;
  const score = pw.length < 8 ? 0 : pw.length >= 14 || (pw.length >= 10 && kinds >= 3) ? 3 : kinds >= 2 ? 2 : 1;
  const label = ['Too short (8+ characters)', 'Okay', 'Good', 'Strong'][score];
  return (
    <div className="pw-meter" aria-live="polite">
      <div className="pw-bars">{[1, 2, 3].map(i => <i key={i} className={i <= score ? `on s${score}` : ''} />)}</div>
      <span className="t-bs c-muted">{label}</span>
    </div>
  );
}
