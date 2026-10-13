import { Link2, Lock, Trash2, Users } from 'lucide-react';
import FileIcon from '../components/FileIcon.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { useShares, useRefresh } from '../hooks/useVault.js';
import { api } from '../api/http.js';
import { useUI } from '../stores/ui.js';
import { formatDate } from '../lib/format.js';

const STATUS = { active: ['', 'Active'], expired: ['w', 'Expired'], limit: ['w', 'Limit reached'], revoked: ['r', 'Revoked'] };

/**
 * All share links you've created. The link key isn't stored anywhere (it only
 * existed in the URL you copied), so full links can't be shown again – by design.
 */
export default function SharedPage() {
  const { data = [], isLoading } = useShares();
  const refresh = useRefresh();
  const toast = useUI((s) => s.toast);
  const revoke = async (s) => { await api('DELETE', `/shares/${s.id}`); await refresh(); toast('Link revoked', 'success'); };
  return (
    <div>
      <div className="ph"><div><div className="crumb">Vault / Shared</div><h1>Shared links</h1></div></div>
      <p className="muted" style={{ marginBottom: 18, maxWidth: 720 }}>
        <Lock className="i" style={{ width: 14 }} /> Each link's decryption key lives only in the URL you copied (after the #). We can't show it again — create a new link if you lost it.
      </p>
      {isLoading && <p className="muted">Loading…</p>}
      {!isLoading && data.length === 0 && <EmptyState icon={<Users className="i" />} title="Nothing shared yet" text="Open a file and click Share to create a secure link." />}
      {data.length > 0 && (
        <div className="glass" style={{ borderRadius: 18 }}>
          <table className="tb">
            <thead><tr><th>File</th><th className="hide-sm">Label</th><th className="hide-sm">Created</th><th>Downloads</th><th className="hide-sm">Expires</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id} data-testid="share-row" style={{ cursor: 'default' }}>
                  <td><div className="row"><FileIcon file={s} /><b>{s.name}</b>{s.hasPassword && <Lock className="i" style={{ width: 14, color: 'var(--muted)' }} />}</div></td>
                  <td className="muted hide-sm">{s.label || '—'}</td>
                  <td className="muted hide-sm">{formatDate(s.createdAt)}</td>
                  <td className="muted">{s.downloads}{s.maxDownloads ? ` / ${s.maxDownloads}` : ''}</td>
                  <td className="muted hide-sm">{s.expiresAt ? formatDate(s.expiresAt) : 'Never'}</td>
                  <td><span className={`badge ${STATUS[s.status][0]}`}><Link2 className="i" />{STATUS[s.status][1]}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    {s.status === 'active' && (
                      <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                        <button type="button" className="btn sm d" onClick={() => revoke(s)}><Trash2 className="i" /> Revoke</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
