import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import AuthLayout from './AuthLayout.jsx';
import PasswordInput from '../components/ui/PasswordInput.jsx';
import PasswordStrength from '../components/ui/PasswordStrength.jsx';
import { scorePassword } from '../lib/password.js';
import { recoverAccount } from '../api/auth.js';
import { useUI } from '../stores/ui.js';

/** Forgot password: use the recovery key to decrypt the master key locally, then set a new password. */
export default function Recover() {
  const [email, setEmail] = useState(''); const [rk, setRk] = useState(''); const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const nav = useNavigate();
  const toast = useUI((s) => s.toast);
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (scorePassword(pw).score < 3) return setErr('Choose a stronger password');
    setBusy(true);
    try { await recoverAccount({ email, recoveryKey: rk, newPassword: pw }); toast('Password reset – please log in', 'success'); nav('/login'); } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <AuthLayout side={<><h2>Locked out?<br /><span className="gt">Your recovery key opens the door.</span></h2>
      <p className="muted" style={{ marginTop: 16, fontSize: 16, lineHeight: 1.6, maxWidth: 460 }}>The recovery key decrypts your master key on this device. You then pick a new password — your files stay exactly as they are.</p></>}>
      <form onSubmit={submit}>
        <h1>Recover account</h1>
        <p className="muted" style={{ marginTop: 6 }}>Remembered it? <Link to="/login" className="gt" style={{ fontWeight: 600 }}>Log in</Link></p>
        <label className="l" htmlFor="remail">Email</label><input id="remail" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label className="l" htmlFor="rk">Recovery key</label>
        <textarea id="rk" className="input" rows={3} value={rk} onChange={(e) => setRk(e.target.value)} placeholder="ABCD-EFGH-…" style={{ fontFamily: 'ui-monospace, monospace', resize: 'vertical' }} />
        <label className="l">New master password</label><PasswordInput value={pw} onChange={setPw} autoComplete="new-password" />
        {pw && <PasswordStrength password={pw} />}
        {err && <p className="err">{err}</p>}
        <button type="submit" className="btn p w lg" style={{ marginTop: 20 }} disabled={busy || !email || !rk || !pw}><KeyRound className="i" /> {busy ? 'Re-encrypting…' : 'Reset password'}</button>
      </form>
    </AuthLayout>
  );
}
