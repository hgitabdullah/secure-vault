import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Lock, Fingerprint } from 'lucide-react';
import AuthLayout from './AuthLayout.jsx';
import PasswordInput from '../components/ui/PasswordInput.jsx';
import PasswordStrength from '../components/ui/PasswordStrength.jsx';
import { scorePassword } from '../lib/password.js';
import Switch from '../components/ui/Switch.jsx';
import { register } from '../api/auth.js';

/** Create account. Keys are generated here; next step shows the recovery key. */
export default function Signup() {
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [ack, setAck] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const nav = useNavigate();
  const strong = scorePassword(password).score >= 3 && password.length >= 10;
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (!strong) return setErr('Please choose a stronger password (10+ chars, mix of types).');
    if (!ack) return setErr("Please confirm you understand we can't reset your password.");
    setBusy(true);
    try {
      await register({ name, email, password });
      nav('/recovery-key');
    } catch (e2) { setErr(e2.message); setBusy(false); }
  };
  return (
    <AuthLayout
      side={<>
        <h2>Create a vault only <span className="gt">you</span> can open.</h2>
        <p className="muted" style={{ marginTop: 16, fontSize: 16, lineHeight: 1.6, maxWidth: 460 }}>Your password never leaves this device. It is turned into an encryption key with Argon2id, right here in your browser.</p>
        <div className="col" style={{ gap: 14, marginTop: 30 }}>
          {['AES-256-GCM encryption for every file', 'Access from any computer', '10 GB free, no card needed'].map((t) => <div className="row" key={t}><CheckCircle2 className="i" style={{ color: 'var(--success)' }} /><span>{t}</span></div>)}
        </div>
      </>}
      footer={<p className="muted" style={{ fontSize: 12 }}>Open-source MERN project · zero-knowledge by design</p>}
    >
      <form onSubmit={submit}>
        <h1>Create your account</h1>
        <p className="muted" style={{ marginTop: 6 }}>Already have one? <Link to="/login" className="gt" style={{ fontWeight: 600 }}>Log in</Link></p>
        <label className="l" htmlFor="name">Full name</label><input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
        <label className="l" htmlFor="email">Email</label><input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        <label className="l" htmlFor="password">Master password</label><PasswordInput id="password" value={password} onChange={setPassword} autoComplete="new-password" />
        <PasswordStrength password={password} />
        <label className="row" style={{ margin: '18px 0', fontSize: 13, gap: 10 }}><Switch checked={ack} onChange={setAck} label="acknowledge" id="ack" />I understand SecureVault can&apos;t reset my password</label>
        {err && <p className="err" style={{ marginBottom: 10 }}>{err}</p>}
        <button type="submit" className="btn p w lg" disabled={busy}><Lock className="i" /> {busy ? 'Generating keys…' : 'Create secure vault'}</button>
        <div className="row" style={{ margin: '16px 0', color: 'var(--muted)', fontSize: 12 }}><hr style={{ flex: 1, borderColor: 'var(--border)' }} />or<hr style={{ flex: 1, borderColor: 'var(--border)' }} /></div>
        <button type="button" className="btn w" disabled title="Passkeys are on the roadmap"><Fingerprint className="i" /> Passkey sign-up (coming soon)</button>
      </form>
    </AuthLayout>
  );
}
