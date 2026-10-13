import { useState } from 'react';
import { Share2, Copy, Info, ArrowRight, Check } from 'lucide-react';
import Modal from './ui/Modal.jsx';
import Switch from './ui/Switch.jsx';
import { http, api } from '../api/http.js';
import { useAuth } from '../stores/auth.js';
import { useUI } from '../stores/ui.js';
import { createShare } from '../crypto/vault.js';
import { useRefresh } from '../hooks/useVault.js';

const EXPIRY = [['1 hour', 3600e3], ['1 day', 864e5], ['7 days', 7 * 864e5], ['30 days', 30 * 864e5], ['Never', 0]];

/**
 * Create a share link. The link key is generated here and lives only in the
 * URL fragment (#k=...), which browsers never send to the server.
 */
export default function ShareDialog({ file, onClose }) {
  const [usePw, setUsePw] = useState(false);
  const [password, setPassword] = useState('');
  const [expiry, setExpiry] = useState(7 * 864e5);
  const [limit, setLimit] = useState('');
  const [label, setLabel] = useState('');
  const [link, setLink] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const toast = useUI((s) => s.toast);
  const refresh = useRefresh();

  const create = async () => {
    setError('');
    if (usePw && password.length < 4) { setError('Use a password of at least 4 characters'); return; }
    setBusy(true);
    try {
      const r = await createShare(http, useAuth.getState().masterKey, file, {
        password: usePw ? password : undefined,
        expiresAt: expiry ? new Date(Date.now() + expiry).toISOString() : null,
        maxDownloads: limit ? Number(limit) : null, label: label || undefined,
      });
      setLink({ url: `${window.location.origin}${r.path}`, id: r.share.id });
      await refresh();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link.url); } catch { /* clipboard may be blocked; text is selectable */ }
    setCopied(true); toast('Link copied', 'success');
  };
  const revoke = async () => { await api('DELETE', `/shares/${link.id}`); await refresh(); toast('Link revoked', 'success'); onClose(); };

  return (
    <Modal title={`Share "${file.name}"`} subtitle="Recipients decrypt in their browser — we never see the file." icon={<Share2 className="i" />} onClose={onClose} width={560}>
      <div className="optrow" style={{ marginTop: 12 }}>
        <div><b>Password protection</b><div className="muted" style={{ fontSize: 12 }}>Require a password to open the link</div></div>
        <Switch checked={usePw} onChange={setUsePw} label="Password protection" />
      </div>
      {usePw && <input className="input" type="password" placeholder="Link password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ marginTop: 12 }} data-testid="share-password" disabled={!!link} />}
      <label className="l">Link expires</label>
      <div className="chips">{EXPIRY.map(([t, v]) => <button type="button" key={t} className={`chip${expiry === v ? ' on' : ''}`} onClick={() => setExpiry(v)} disabled={!!link}>{t}</button>)}</div>
      <label className="l" htmlFor="dl-limit">Download limit</label>
      <div className="row"><input id="dl-limit" className="input" type="number" min="1" placeholder="∞" value={limit} onChange={(e) => setLimit(e.target.value)} style={{ width: 110 }} disabled={!!link} /><span className="muted">downloads, then the link stops working</span></div>
      <label className="l" htmlFor="share-label">Label (only you see this)</label>
      <input id="share-label" className="input" placeholder="e.g. Client review" value={label} onChange={(e) => setLabel(e.target.value)} disabled={!!link} maxLength={80} />
      {link && (
        <>
          <label className="l">Secure link</label>
          <div className="link"><span data-testid="share-url" style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{link.url}</span>
            <button type="button" className="btn p sm" onClick={copy}>{copied ? <Check className="i" /> : <Copy className="i" />} Copy</button></div>
          <p className="muted row" style={{ fontSize: 12, marginTop: 8, gap: 6 }}><Info className="i" /> The decryption key is after the # and is never sent to our servers.</p>
        </>
      )}
      {error && <p className="err">{error}</p>}
      <div className="row between" style={{ marginTop: 20 }}>
        {link ? <button type="button" className="btn d sm" onClick={revoke}>Revoke link</button> : <span />}
        {link ? <button type="button" className="btn p" onClick={onClose}>Done</button>
          : <button type="button" className="btn p" onClick={create} disabled={busy}>{busy ? 'Encrypting…' : <>Create link <ArrowRight className="i" /></>}</button>}
      </div>
    </Modal>
  );
}
