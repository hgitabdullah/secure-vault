import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Lock, Clock, Download, AlertTriangle, ShieldCheck, Loader2 } from 'lucide-react';
import Logo from '../components/ui/Logo.jsx';
import FileIcon from '../components/FileIcon.jsx';
import { openShareMeta, downloadShare } from '../crypto/vault.js';
import { HttpError } from '../api/http.js';
import { formatBytes, fileKind, initials } from '../lib/format.js';
import { saveBlob } from '../hooks/useDecryptedFile.js';

/** Plain fetch adapter (no login) for the public share endpoints. */
const publicHttp = {
  async json(method, path, body) {
    const r = await fetch(`/api/v1${path}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new HttpError(r.status, data.error?.code, data.error?.message || 'Request failed');
    return data;
  },
  async getBytes(url) { const r = await fetch(url); if (!r.ok) throw new Error('Download failed'); return new Uint8Array(await r.arrayBuffer()); },
};

/**
 * Public share page. The key is read from location.hash (#k=...) – it never
 * reaches the server. Decryption happens entirely in this browser.
 */
export default function PublicShare() {
  const { token } = useParams();
  const [meta, setMeta] = useState(null); const [err, setErr] = useState(''); const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false); const [progress, setProgress] = useState(0); const [done, setDone] = useState(null);
  useEffect(() => {
    const k = new URLSearchParams(window.location.hash.slice(1)).get('k');
    if (!k) { setErr('This link is missing its decryption key (the part after #).'); return; }
    openShareMeta(publicHttp, token, k).then(setMeta).catch((e) => setErr(e.status ? e.message : 'This link is invalid or its key is wrong.'));
  }, [token]);
  const download = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const chunks = await downloadShare(publicHttp, token, meta.linkKey, meta, pw, (p) => setProgress(p.received / (p.size || 1)));
      const blob = new Blob(chunks, { type: meta.mime });
      setDone(blob); saveBlob(blob, meta.name);
      if (meta.downloadsLeft) setMeta({ ...meta, downloadsLeft: meta.downloadsLeft - 1 });
    } catch (e2) { setErr(e2.name === 'OperationError' ? 'Could not decrypt – wrong password or key.' : e2.message); } finally { setBusy(false); }
  };
  return (
    <div className="page">
      <nav className="nav"><Logo /><Link className="btn sm" to="/signup">Get your own vault</Link></nav>
      <div style={{ display: 'grid', placeItems: 'center', padding: '60px 20px' }}>
        <div className="glass" style={{ width: 520, maxWidth: '100%', padding: 36, textAlign: 'center' }} data-testid="public-share">
          {!meta && !err && <Loader2 className="i spin" />}
          {!meta && err && <><AlertTriangle className="i" style={{ width: 40, height: 40, color: 'var(--warn)' }} /><h2 style={{ marginTop: 12 }}>Link unavailable</h2><p className="muted" style={{ marginTop: 8 }}>{err}</p></>}
          {meta && (
            <form onSubmit={download}>
              <div className="av" style={{ width: 56, height: 56, margin: '0 auto', fontSize: 18 }}>{initials(meta.ownerName)}</div>
              <p className="muted" style={{ marginTop: 12 }}><b style={{ color: 'var(--text)' }}>{meta.ownerName}</b> shared a file with you</p>
              <div className="glass row" style={{ padding: 16, margin: '22px 0', textAlign: 'left', borderRadius: 16 }}>
                <FileIcon file={meta} size={48} />
                <div style={{ flex: 1, minWidth: 0 }}><b data-testid="public-name" style={{ wordBreak: 'break-all' }}>{meta.name}</b><div className="muted" style={{ fontSize: 12 }}>{formatBytes(meta.size)} · {fileKind(meta.mime, meta.name).label}</div></div>
                <span className="badge"><Lock className="i" /> Encrypted</span>
              </div>
              <div className="row" style={{ justifyContent: 'center', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
                {meta.expiresAt && <span className="badge w"><Clock className="i" /> Expires {new Date(meta.expiresAt).toLocaleDateString()}</span>}
                {meta.downloadsLeft != null && <span className="badge v"><Download className="i" /> {meta.downloadsLeft} downloads left</span>}
              </div>
              {meta.hasPassword && <input className="input" type="password" placeholder="Enter the link password" value={pw} onChange={(e) => setPw(e.target.value)} style={{ marginBottom: 14 }} data-testid="public-password" required />}
              {err && <p className="err" style={{ marginBottom: 10 }}>{err}</p>}
              <button type="submit" className="btn p w lg" disabled={busy}>{busy ? `Decrypting… ${Math.round(progress * 100)}%` : <><Download className="i" /> Decrypt &amp; download</>}</button>
              {done && <p className="badge" style={{ marginTop: 14 }} data-testid="public-done">Decrypted {formatBytes(done.size)} in your browser</p>}
              <p className="muted row" style={{ fontSize: 12, marginTop: 16, justifyContent: 'center', gap: 6 }}><ShieldCheck className="i" /> Decrypted in your browser · SecureVault never sees this file</p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
