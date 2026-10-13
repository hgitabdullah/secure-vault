import { useRef, useState } from 'react';
import { UploadCloud, FolderOpen, Check, ShieldCheck, AlertTriangle } from 'lucide-react';
import Modal from './ui/Modal.jsx';
import FileIcon from './FileIcon.jsx';
import { useUI } from '../stores/ui.js';
import { useUploader } from '../hooks/useUploader.js';
import { formatBytes } from '../lib/format.js';

/** Upload dialog: drop zone + per-file encryption/upload progress. */
export default function UploadModal({ folderId }) {
  const { uploads, setUploadOpen, clearUploads } = useUI();
  const upload = useUploader();
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const close = () => { setUploadOpen(false); clearUploads(); };
  const busy = uploads.some((u) => !['done', 'error'].includes(u.phase));
  return (
    <Modal title="Upload files" subtitle="Files are encrypted on this device before uploading." onClose={close}>
      <div className="drop" style={over ? { borderColor: 'var(--accent)' } : undefined}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files, { folderId }); }}>
        <div className="big"><UploadCloud className="i" /></div>
        <b style={{ fontSize: 16 }}>Drag &amp; drop files here</b>
        <p className="muted" style={{ margin: '6px 0 14px' }}>Any file type · encrypted in 8 MiB chunks with AES-256-GCM</p>
        <button type="button" className="btn sm" onClick={() => input.current.click()}><FolderOpen className="i" /> Browse files</button>
        <input ref={input} type="file" multiple hidden data-testid="file-input"
          onChange={(e) => { if (e.target.files.length) upload(e.target.files, { folderId }); e.target.value = ''; }} />
      </div>
      <div style={{ maxHeight: 260, overflow: 'auto' }}>
        {uploads.map((u) => (
          <div className="up" key={u.id} data-testid="upload-row">
            <FileIcon file={{ name: u.name, mime: u.mime }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row between">
                <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</b>
                {u.phase === 'done' ? <span className="badge"><Check className="i" /> Done</span>
                  : u.phase === 'error' ? <span className="badge r"><AlertTriangle className="i" /> Failed</span>
                    : <span className="muted" style={{ fontSize: 12 }}>{u.phase === 'encrypting' ? 'Encrypting…' : `${u.progress}%`}</span>}
              </div>
              <div className="pb"><i style={{ width: `${u.progress}%`, background: u.phase === 'done' ? 'var(--success)' : u.phase === 'error' ? 'var(--danger)' : undefined }} /></div>
              <span className="muted" style={{ fontSize: 12 }}>
                {u.phase === 'done' ? `${formatBytes(u.size)} · encrypted & uploaded`
                  : u.phase === 'error' ? u.error
                    : u.chunkCount ? `Chunk ${u.chunk} of ${u.chunkCount} · ${formatBytes(u.size)}` : `Waiting · ${formatBytes(u.size)}`}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="row between" style={{ marginTop: 18 }}>
        <span className="muted row" style={{ fontSize: 12, gap: 6 }}><ShieldCheck className="i" /> Zero-knowledge: keys never leave your browser</span>
        <button type="button" className="btn p" onClick={close} disabled={busy}>{busy ? 'Uploading…' : 'Done'}</button>
      </div>
    </Modal>
  );
}
