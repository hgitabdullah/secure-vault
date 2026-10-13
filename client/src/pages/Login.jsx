import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { LogIn, ShieldCheck, Smartphone, Unlock, Info } from 'lucide-react';
import AuthLayout from './AuthLayout.jsx';
import PasswordInput from '../components/ui/PasswordInput.jsx';
import OtpInput from '../components/ui/OtpInput.jsx';
import { login, verify2fa, logout } from '../api/auth.js';
import { useAuth } from '../stores/auth.js';
import { deriveLoginKeys, unwrapKey } from '../crypto/core.js';

/**
 * Login in up to two steps (password → optional 2FA).
 * If a session already exists (refresh cookie) but the page was reloaded,
 * the master key is gone from memory, so we show "Unlock vault" instead.
 */
export default function Login() {
  const [params] = useSearchParams();
  const demo = params.get('demo') === '1';
  const user = useAuth((s) => s.user);
  const [email, setEmail] = useState(demo ? 'demo@securevault.app' : '');
  const [password, setPassword] = useState(demo ? 'Demo@12345' : '');
  const [step, setStep] = useState(user ? 'unlock' : 'password');
  const [ticket, setTicket] = useState(null);
  const [code, setCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const nav = useNavigate();
  const from = useLocation().state?.from || '/app';

  const wrap = (fn) => async (e) => {
    e?.preventDefault(); setErr(''); setBusy(true);
    try { await fn(); } catch (e2) { setErr(e2.code === 'OperationError' || e2.name === 'OperationError' ? 'Incorrect password' : e2.message); } finally { setBusy(false); }
  };
  const submitPassword = wrap(async () => {
    const r = await login({ email, password });
    if (r.twoFactorRequired) { setTicket(r); setStep('2fa'); return; }
    nav(from, { replace: true });
  });
  const submit2fa = wrap(async () => {
    await verify2fa({ ticket: ticket.ticket, code, kek: ticket.kek });
    nav(from, { replace: true });
  });
  const submitUnlock = wrap(async () => {
    const { kek } = await deriveLoginKeys(password, user.kdfSalt, user.kdfParams);
    const mk = await unwrapKey(kek, user.encMasterKey); // throws if the password is wrong
    useAuth.setState({ masterKey: mk });
    nav(from, { replace: true });
  });

  if (step === '2fa') {
    return (
      <div className="page" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
        <form className="glass" style={{ width: 460, maxWidth: '100%', padding: 38, textAlign: 'center' }} onSubmit={submit2fa}>
          <div className="ficon" style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--grad)', color: '#fff', margin: '0 auto 18px' }}><Smartphone className="i" /></div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Two-factor verification</h1>
          <p className="muted" style={{ marginTop: 8 }}>{useBackup ? 'Enter one of your backup codes.' : 'Enter the 6-digit code from your authenticator app.'}</p>
          {useBackup ? <input className="input" style={{ margin: '22px 0', textAlign: 'center' }} value={code} onChange={(e) => setCode(e.target.value)} placeholder="backup code" autoFocus />
            : <OtpInput value={code} onChange={setCode} onComplete={() => {}} />}
          {err && <p className="err" style={{ marginBottom: 10 }}>{err}</p>}
          <button type="submit" className="btn p w lg" disabled={busy || (!useBackup && code.length !== 6)}><ShieldCheck className="i" /> {busy ? 'Verifying…' : 'Verify & unlock vault'}</button>
          <p className="muted" style={{ marginTop: 18, fontSize: 13 }}>{useBackup ? 'Have your phone? ' : 'Lost your phone? '}
            <button type="button" className="gt" style={{ fontWeight: 600, background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }} onClick={() => { setUseBackup(!useBackup); setCode(''); }}>{useBackup ? 'Use authenticator code' : 'Use a backup code'}</button></p>
        </form>
      </div>
    );
  }

  return (
    <AuthLayout
      side={<><h2>Welcome back.<br /><span className="gt">Your vault is waiting.</span></h2>
        <p className="muted" style={{ marginTop: 16, fontSize: 16, lineHeight: 1.6, maxWidth: 460 }}>Sign in from any computer. Your files are decrypted only on this device, after you unlock it.</p></>}
      footer={<div className="glass row" style={{ padding: 16, maxWidth: 420 }}><ShieldCheck className="i" /><span style={{ fontSize: 13 }}>New sign-ins appear in your activity log, and you can sign out any device remotely.</span></div>}
    >
      {step === 'unlock' ? (
        <form onSubmit={submitUnlock}>
          <h1>Unlock your vault</h1>
          <p className="muted" style={{ marginTop: 6 }}>Signed in as <b>{user?.email}</b>. Your keys are kept in memory only, so enter your password to decrypt.</p>
          <label className="l" htmlFor="password">Master password</label>
          <PasswordInput id="password" value={password} onChange={setPassword} autoFocus />
          {err && <p className="err">{err}</p>}
          <button type="submit" className="btn p w lg" style={{ marginTop: 20 }} disabled={busy || !password}><Unlock className="i" /> {busy ? 'Deriving key…' : 'Unlock'}</button>
          <button type="button" className="btn g w" style={{ marginTop: 10 }} onClick={async () => { await logout(); setStep('password'); }}>Use a different account</button>
        </form>
      ) : (
        <form onSubmit={submitPassword}>
          <h1>Log in</h1>
          <p className="muted" style={{ marginTop: 6 }}>New here? <Link to="/signup" className="gt" style={{ fontWeight: 600 }}>Create an account</Link></p>
          {demo && <p className="badge v" style={{ marginTop: 12 }}><Info className="i" /> Demo account pre-filled</p>}
          <label className="l" htmlFor="email">Email</label>
          <input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          <div className="row between"><label className="l" htmlFor="password">Master password</label><Link to="/recover" className="muted" style={{ fontSize: 12, marginTop: 8 }}>Use recovery key</Link></div>
          <PasswordInput id="password" value={password} onChange={setPassword} />
          {err && <p className="err">{err}</p>}
          <button type="submit" className="btn p w lg" style={{ marginTop: 20 }} disabled={busy || !email || !password}><LogIn className="i" /> {busy ? 'Deriving key…' : 'Continue'}</button>
          <p className="muted" style={{ fontSize: 12, marginTop: 14, textAlign: 'center' }}>Your password is processed with Argon2id on this device and never sent to the server.</p>
        </form>
      )}
    </AuthLayout>
  );
}
