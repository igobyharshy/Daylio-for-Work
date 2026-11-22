import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Icon } from '../ui/Icon';
import { Btn, Field, IBtn } from '../ui/kit';

/** F14 — email + password only. Accounts are created by Harshy; there is no sign-up. */
export function SignIn({ signedOut }: { signedOut?: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [forgot, setForgot] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true); setErr('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setErr(error.message.toLowerCase().includes('invalid') ? 'That email and password don’t match. Check them and try again.' : error.message);
  };
  return (
    <div className="signin">
      <form className="signin-card" onSubmit={submit}>
        <div className="row gap-12"><span className="brand-logo" style={{ width: 48, height: 48, borderRadius: 14 }}><Icon name="timer" size={28} /></span><span className="t-tl">Ontrack</span></div>
        <div className="col gap-8"><span className="t-hm">Sign in</span><span className="t-bl c-muted">Promise a time. Keep it. Learn when you don’t.</span></div>
        {signedOut && <div className="row gap-8 t-bm" style={{ background: 'var(--secondary-container)', color: 'var(--on-secondary-container)', borderRadius: 12, padding: '10px 14px' }}><Icon name="checkCircle" size={20} />You signed out. Your data stays saved.</div>}
        <Field label="Email" type="email" name="email" autoComplete="username" value={email} onChange={setEmail} placeholder="you@example.com" autoFocus bg="var(--surface-lowest)" error={!!err} />
        <Field label="Password" type={show ? 'text' : 'password'} name="password" autoComplete="current-password" value={password} onChange={setPassword} bg="var(--surface-lowest)" error={!!err}
          trail={<IBtn sm icon={show ? 'eyeOff' : 'eye'} label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)} />} />
        {err && <div className="row gap-8 t-bs c-error" role="alert"><Icon name="warn" size={18} />{err}</div>}
        <Btn type="submit" big disabled={busy || !email.trim() || !password} className="">{busy ? 'Signing in…' : 'Sign in'}</Btn>
        <button type="button" className="link-btn" style={{ alignSelf: 'center' }} onClick={() => setForgot(!forgot)}>Forgot password?</button>
        {forgot && <div className="t-bm c-muted" style={{ textAlign: 'center', marginTop: -12 }}>Ask Harshy to reset it. Accounts are invite-only.</div>}
      </form>
      <span className="t-bs c-muted">Ontrack is invite-only. Ask Harshy for access.</span>
    </div>
  );
}
