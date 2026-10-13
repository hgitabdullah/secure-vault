import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Laptop, Smartphone, LogOut, ShieldCheck, KeyRound, Sun, Moon, AlertTriangle, Activity as ActivityIcon } from 'lucide-react';
import PasswordInput from '../components/ui/PasswordInput.jsx';
import PasswordStrength from '../components/ui/PasswordStrength.jsx';
import { scorePassword } from '../lib/password.js';
import { api } from '../api/http.js';
import { changePassword, authKeyFor } from '../api/auth.js';
import { useAuth } from '../stores/auth.js';
import { useUI } from '../stores/ui.js';
import { useTheme } from '../stores/theme.js';
import { formatDate, initials } from '../lib/format.js';

const TABS = [['profile', 'Profile'], ['security', 'Security'], ['devices', 'Devices'], ['activity', 'Activity'], ['appearance', 'Appearance'], ['danger', 'Danger zone']];

/* ---------- Profile ---------- */
function Profile() {
  const user = useAuth((s) => s.user);
  const [name, setName] = useState(user.name);
  const toast = useUI((s) => s.toast);
  const qc = useQueryClient();
  return (
    <div className="glass card">
      <div className="row" style={{ marginBottom: 10 }}><div className="av" style={{ width: 56, height: 56, fontSize: 18 }}>{initials(user.name, user.email)}</div>
        <div><h3>{user.name || 'Your profile'}</h3><p className="muted">{user.email} · member since {new Date(user.createdAt).toLocaleDateString()}</p></div></div>
      <form onSubmit={async (e) => { e.preventDefault(); const r = await api('PATCH', '/auth/me', { name }); useAuth.getState().setUser(r.user); qc.invalidateQueries({ queryKey: ['me'] }); toast('Profile saved', 'success'); }}>
        <label className="l" htmlFor="pname">Full name</label>
        <input id="pname" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} style={{ maxWidth: 420 }} />
        <label className="l">Email</label>
        <input className="input" value={user.email} disabled style={{ maxWidth: 420 }} />
        <button type="submit" className="btn p" style={{ marginTop: 18 }} disabled={!name.trim()}>Save changes</button>
      </form>
    </div>
  );
}

/* ---------- Security: password + 2FA ---------- */
function PasswordCard() {
  const [cur, setCur] = useState(''); const [next, setNext] = useState(''); const [conf, setConf] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const toast = useUI((s) => s.toast);
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (next !== conf) return setErr('New passwords do not match');
    if (scorePassword(next).score < 3) return setErr('Choose a stronger password');
    setBusy(true);
    try { await changePassword(cur, next); setCur(''); setNext(''); setConf(''); toast('Password changed – other devices were signed out', 'success'); } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <form className="glass card" onSubmit={submit}>
      <h3><KeyRound className="i" /> Change master password</h3>
      <p className="muted" style={{ fontSize: 13 }}>Your master key is re-wrapped with the new password on this device. Files don't need re-encryption.</p>
      <div style={{ maxWidth: 420 }}>
        <label className="l">Current password</label><PasswordInput value={cur} onChange={setCur} />
        <label className="l">New password</label><PasswordInput value={next} onChange={setNext} autoComplete="new-password" />
        {next && <PasswordStrength password={next} />}
        <label className="l">Confirm new password</label><PasswordInput value={conf} onChange={setConf} autoComplete="new-password" />
      </div>
      {err && <p className="err">{err}</p>}
      <button type="submit" className="btn p" style={{ marginTop: 18 }} disabled={busy || !cur || !next}>{busy ? 'Re-encrypting keys…' : 'Update password'}</button>
    </form>
  );
}

function TwoFactorCard() {
  const user = useAuth((s) => s.user);
  const [setup, setSetup] = useState(null); const [code, setCode] = useState(''); const [codes, setCodes] = useState(null); const [err, setErr] = useState('');
  const toast = useUI((s) => s.toast);
  const reloadMe = async () => useAuth.getState().setUser((await api('GET', '/auth/me')).user);
  const start = async () => { setErr(''); setSetup(await api('POST', '/auth/2fa/setup')); };
  const enable = async () => {
    setErr('');
    try { const r = await api('POST', '/auth/2fa/enable', { code }); setCodes(r.backupCodes); setSetup(null); setCode(''); await reloadMe(); toast('Two-factor authentication enabled', 'success'); } catch (e) { setErr(e.message); }
  };
  const disable = async () => {
    setErr('');
    try { await api('POST', '/auth/2fa/disable', { code }); setCode(''); await reloadMe(); toast('Two-factor authentication disabled'); } catch (e) { setErr(e.message); }
  };
  return (
    <div className="glass card" data-testid="twofa-card">
      <div className="row between"><h3><ShieldCheck className="i" /> Two-factor authentication</h3>
        {user.totpEnabled ? <span className="badge">Enabled</span> : <span className="badge w">Off</span>}</div>
      <p className="muted" style={{ fontSize: 13 }}>Use an authenticator app (Google Authenticator, 1Password, Authy…) for a 6-digit code at sign-in.</p>
      {codes && (
        <div className="alert" style={{ marginTop: 14, flexDirection: 'column' }}>
          <b>Save these one-time backup codes</b>
          <div className="words" style={{ margin: '8px 0 0' }}>{codes.map((c) => <div key={c}>{c}</div>)}</div>
        </div>
      )}
      {!user.totpEnabled && !setup && <button type="button" className="btn p" style={{ marginTop: 16 }} onClick={start}>Set up 2FA</button>}
      {setup && (
        <div className="row" style={{ marginTop: 16, alignItems: 'flex-start', gap: 22, flexWrap: 'wrap' }}>
          <img src={setup.qr} alt="2FA QR code" width={180} height={180} style={{ borderRadius: 14, background: '#fff', padding: 6 }} />
          <div style={{ flex: 1, minWidth: 240 }}>
            <p className="muted" style={{ fontSize: 13 }}>Scan the QR code, or enter this key manually:</p>
            <code data-testid="totp-secret" style={{ display: 'block', margin: '8px 0 14px', wordBreak: 'break-all' }}>{setup.secret}</code>
            <input className="input" inputMode="numeric" placeholder="6-digit code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} style={{ maxWidth: 200 }} />
            <button type="button" className="btn p" style={{ marginLeft: 10 }} disabled={code.length !== 6} onClick={enable}>Verify & enable</button>
          </div>
        </div>
      )}
      {user.totpEnabled && (
        <div className="row" style={{ marginTop: 16 }}>
          <input className="input" placeholder="Code or backup code" value={code} onChange={(e) => setCode(e.target.value)} style={{ maxWidth: 220 }} />
          <button type="button" className="btn d" disabled={code.length < 6} onClick={disable}>Disable 2FA</button>
        </div>
      )}
      {err && <p className="err">{err}</p>}
      <div className="optrow" style={{ borderBottom: 0, marginTop: 10 }}>
        <div><b>Passkeys</b><div className="muted" style={{ fontSize: 12 }}>WebAuthn passkeys & security keys are on the roadmap (see docs/SECURITY.md).</div></div>
        <span className="badge v">Coming soon</span>
      </div>
    </div>
  );
}

/* ---------- Devices ---------- */
function Devices() {
  const { data, refetch } = useQuery({ queryKey: ['devices'], queryFn: () => api('GET', '/devices') });
  const toast = useUI((s) => s.toast);
  return (
    <div className="glass card">
      <h3>Signed-in devices</h3>
      <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Each device has its own session. Signing a device out takes effect immediately.</p>
      {(data?.devices || []).map((d) => (
        <div className="dev" key={d.id} data-testid="device-row">
          <div className="ficon t1">{/Android|iOS/.test(d.name) ? <Smartphone className="i" /> : <Laptop className="i" />}</div>
          <div style={{ flex: 1 }}><b>{d.name}</b> {d.current && <span className="badge v">This device</span>}
            <div className="muted" style={{ fontSize: 12 }}>{d.ip} · last active {formatDate(d.lastSeen)} · signed in {formatDate(d.createdAt)}</div></div>
          {!d.current && <button type="button" className="btn sm d" onClick={async () => { await api('DELETE', `/devices/${d.id}`); refetch(); toast('Device signed out', 'success'); }}><LogOut className="i" /> Sign out</button>}
        </div>
      ))}
    </div>
  );
}

/* ---------- Activity ---------- */
const LABELS = {
  login: 'Signed in', 'login.failed': 'Failed sign-in attempt', 'account.created': 'Account created', 'file.upload': 'Uploaded a file',
  'file.version': 'Uploaded a new version', 'file.trash': 'Moved a file to trash', 'file.restore': 'Restored a file', 'file.delete': 'Deleted a file',
  'file.rename': 'Renamed a file', 'file.move': 'Moved a file', 'file.version.restore': 'Restored a version', 'folder.create': 'Created a folder',
  'folder.trash': 'Moved a folder to trash', 'folder.delete': 'Deleted a folder', 'share.create': 'Created a share link', 'share.revoke': 'Revoked a share link',
  '2fa.enabled': 'Enabled 2FA', '2fa.disabled': 'Disabled 2FA', '2fa.failed': 'Failed 2FA code', 'password.changed': 'Changed password',
  'password.recovered': 'Reset password with recovery key', 'device.revoked': 'Signed out a device', 'trash.empty': 'Emptied trash', 'profile.updated': 'Updated profile',
};
function ActivityLog() {
  const [page, setPage] = useState(1);
  const { data } = useQuery({ queryKey: ['activity', page], queryFn: () => api('GET', `/activity?page=${page}`) });
  const items = data?.items || [];
  return (
    <div className="glass card">
      <h3>Activity log</h3>
      <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Sign-ins, uploads, shares and security events. New sign-ins are highlighted.</p>
      {items.map((a) => (
        <div className="dev" key={a.id} data-testid="activity-row">
          <div className={`ficon ${a.action.includes('failed') ? 't2' : a.action === 'login' ? 't3' : 't1'}`}><ActivityIcon className="i" /></div>
          <div style={{ flex: 1 }}><b>{LABELS[a.action] || a.action}</b>{a.action === 'login' && <span className="badge w" style={{ marginLeft: 8 }}>Sign-in alert</span>}
            <div className="muted" style={{ fontSize: 12 }}>{a.detail ? `${a.detail} · ` : ''}{a.ip} · {formatDate(a.createdAt)}</div></div>
        </div>
      ))}
      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" className="btn sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Newer</button>
        <button type="button" className="btn sm" disabled={items.length < 30} onClick={() => setPage(page + 1)}>Older</button>
      </div>
    </div>
  );
}

function Appearance() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="glass card">
      <h3>Theme</h3><p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>Choose how SecureVault looks on this device.</p>
      <div className="chips">
        <button type="button" className={`chip${theme === 'dark' ? ' on' : ''}`} onClick={() => setTheme('dark')}><Moon className="i" /> Dark</button>
        <button type="button" className={`chip${theme === 'light' ? ' on' : ''}`} onClick={() => setTheme('light')}><Sun className="i" /> Light</button>
      </div>
    </div>
  );
}

function Danger() {
  const [pw, setPw] = useState(''); const [confirm, setConfirm] = useState(''); const [err, setErr] = useState('');
  const nav = useNavigate();
  const del = async () => {
    setErr('');
    try { await api('DELETE', '/auth/me', { authKey: await authKeyFor(pw) }); useAuth.getState().clear(); nav('/'); } catch (e) { setErr(e.message); }
  };
  return (
    <div className="glass card" style={{ borderColor: 'rgba(244,63,94,.35)' }}>
      <h3 style={{ color: 'var(--danger)' }}><AlertTriangle className="i" /> Delete account</h3>
      <p className="muted" style={{ fontSize: 13 }}>Permanently erases your account, every file, version and share link. This cannot be undone.</p>
      <div style={{ maxWidth: 420 }}>
        <label className="l">Master password</label><PasswordInput value={pw} onChange={setPw} />
        <label className="l">Type DELETE to confirm</label><input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      {err && <p className="err">{err}</p>}
      <button type="button" className="btn d" style={{ marginTop: 18 }} disabled={confirm !== 'DELETE' || !pw} onClick={del}>Delete my account forever</button>
    </div>
  );
}

/** Settings with tabs (tab kept in the URL: ?tab=security). */
export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'profile';
  return (
    <div>
      <div className="ph"><div><div className="crumb">Vault / Settings</div><h1>Settings</h1></div></div>
      <div className="tabs" role="tablist">
        {TABS.map(([k, t]) => <span key={k} role="tab" aria-selected={tab === k} tabIndex={0} className={tab === k ? 'on' : ''} style={{ cursor: 'pointer' }} onClick={() => setParams({ tab: k })}>{t}</span>)}
      </div>
      <div style={{ maxWidth: 860 }}>
        {tab === 'profile' && <Profile />}
        {tab === 'security' && <><PasswordCard /><TwoFactorCard /></>}
        {tab === 'devices' && <Devices />}
        {tab === 'activity' && <ActivityLog />}
        {tab === 'appearance' && <Appearance />}
        {tab === 'danger' && <Danger />}
      </div>
    </div>
  );
}
