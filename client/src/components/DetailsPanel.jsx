import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Download, Share2, Star, Trash2, Pencil, FolderInput, Link2 } from 'lucide-react';
import Preview from './Preview.jsx';
import VersionHistory from './VersionHistory.jsx';
import { useDialogs } from '../stores/ui.js';
import { useDecryptedFile, saveBlob } from '../hooks/useDecryptedFile.js';
import { useFileActions } from '../hooks/useFileActions.js';
import { useAllFolders, useShares } from '../hooks/useVault.js';
import { fileKind, formatBytes, formatDate } from '../lib/format.js';

/** Right-hand panel: decrypted preview, actions, metadata, versions and share links. */
export default function DetailsPanel() {
  const { details: file, hideDetails, showDetails } = useDialogs();
  const a = useFileActions();
  const folders = useAllFolders().data || [];
  const shares = (useShares().data || []).filter((s) => file && s.fileId === file.id && s.status === 'active');
  const state = useDecryptedFile(file, { enabled: !!file && file.size <= 200 * 1024 * 1024 });
  const [, force] = useState(0);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && hideDetails();
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [hideDetails]);
  if (!file) return null;
  const folder = folders.find((f) => f.id === file.folderId);
  return (
    <div className="ov" style={{ placeItems: 'stretch' }} onMouseDown={(e) => e.target === e.currentTarget && hideDetails()}>
      <motion.aside className="panel" data-testid="details-panel" initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.2 }}>
        <div className="row between"><h2 style={{ fontSize: 18 }}>File details</h2><button type="button" className="btn sm g" aria-label="Close details" onClick={hideDetails}><X className="i" /></button></div>
        <Preview file={file} state={state} />
        <h3 style={{ fontSize: 16, marginBottom: 12, wordBreak: 'break-all' }}>{file.name}</h3>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn p sm" onClick={() => (state.blob ? saveBlob(state.blob, file.name) : a.download(file))}><Download className="i" /> Download</button>
          <button type="button" className="btn sm" onClick={() => a.share(file)}><Share2 className="i" /> Share</button>
          <button type="button" className="btn sm" aria-label="Favorite" onClick={() => a.toggleFavorite(file)}><Star className="i" style={file.favorite ? { fill: '#FCD34D', color: '#FCD34D' } : undefined} /></button>
          <button type="button" className="btn sm" aria-label="Rename" onClick={() => a.rename(file)}><Pencil className="i" /></button>
          <button type="button" className="btn sm" aria-label="Move" onClick={() => a.move(file, 'file')}><FolderInput className="i" /></button>
          <button type="button" className="btn sm d" aria-label="Move to trash" onClick={() => a.trash(file)}><Trash2 className="i" /></button>
        </div>
        <div className="kv">
          <span>Type</span><span>{fileKind(file.mime, file.name).label}</span>
          <span>Size</span><span>{formatBytes(file.size)} ({formatBytes(file.size + Math.ceil(file.size / 8388608 || 1) * 16)} encrypted)</span>
          <span>Location</span><span>My Files{folder ? ` / ${folder.name}` : ''}</span>
          <span>Created</span><span>{formatDate(file.createdAt)}</span>
          <span>Modified</span><span>{formatDate(file.updatedAt)}</span>
          <span>Encryption</span><span>Per-file AES-256 key · wrapped by your master key</span>
        </div>
        <VersionHistory file={file} onChanged={(f) => { showDetails({ ...file, ...f, name: file.name, mime: file.mime }); force((x) => x + 1); }} />
        <h3 style={{ margin: '20px 0 6px', fontSize: 15 }}>Active share links</h3>
        {shares.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Not shared. Create a link with a password and expiry.</p>}
        {shares.map((s) => (
          <div className="glass" key={s.id} style={{ padding: 12, borderRadius: 14, marginBottom: 8 }}>
            <div className="row between"><span style={{ fontSize: 13 }} className="row"><Link2 className="i" /> {s.label || 'Share link'}</span>
              <span className="badge w">{s.expiresAt ? `Expires ${new Date(s.expiresAt).toLocaleDateString()}` : 'No expiry'}</span></div>
          </div>
        ))}
      </motion.aside>
    </div>
  );
}
