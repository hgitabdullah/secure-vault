import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../stores/auth.js';
import { KeyRound, Copy, Download, AlertTriangle, ArrowRight } from 'lucide-react';
import Switch from '../components/ui/Switch.jsx';
import { useUI } from '../stores/ui.js';

/** Shown once after sign-up: the recovery key is the only way back in without the password. */
export default function RecoveryKey() {
  const state = useAuth((s) => s.pending);
  const [saved, setSaved] = useState(false);
  const nav = useNavigate();
  const toast = useUI((s) => s.toast);
  if (!state?.recoveryKey) return <Navigate to="/app" replace />;
  const groups = state.recoveryKey.split('-');
  const download = () => {
    const blob = new Blob([`SecureVault recovery key for ${state.email}\n\n${state.recoveryKey}\n\nKeep this offline and private. Anyone with this key and your email can reset your password.\n`], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'securevault-recovery-key.txt'; a.click(); setSaved(true);
  };
  return (
    <div className="page" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 40 }}>
      <div className="glass" style={{ width: 680, maxWidth: '100%', padding: 38 }}>
        <div className="row"><div className="ficon" style={{ width: 52, height: 52, borderRadius: 16, background: 'var(--grad)', color: '#fff' }}><KeyRound className="i" /></div>
          <div><h1 style={{ fontSize: 24, fontWeight: 800 }}>Save your recovery key</h1><p className="muted">Step 2 of 2 · This is the only way back in if you forget your password.</p></div></div>
        <div className="words" data-testid="recovery-key">{groups.map((g, i) => <div key={i}><em>{i + 1}</em>{g}</div>)}</div>
        <div className="row" style={{ gap: 10, marginBottom: 18 }}>
          <button type="button" className="btn" onClick={download}><Download className="i" /> Download .txt</button>
          <button type="button" className="btn" onClick={async () => { await navigator.clipboard?.writeText(state.recoveryKey).catch(() => {}); toast('Recovery key copied', 'success'); }}><Copy className="i" /> Copy</button>
        </div>
        <div className="alert"><AlertTriangle className="i" /><span>SecureVault can&apos;t see your password or files. If you lose both your password and this key, your data can&apos;t be recovered — by anyone.</span></div>
        <label className="row" style={{ fontSize: 13, gap: 10, margin: '20px 0' }}><Switch checked={saved} onChange={setSaved} label="saved" id="saved-switch" />I have saved my recovery key somewhere safe</label>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn p lg" disabled={!saved} onClick={() => { useAuth.getState().activatePending(); nav('/app', { replace: true }); }}>Continue to my vault <ArrowRight className="i" /></button></div>
      </div>
    </div>
  );
}
