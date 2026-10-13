import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RotateCcw, Upload, Download } from 'lucide-react';
import { api } from '../api/http.js';
import { formatBytes, formatDate } from '../lib/format.js';
import { useUploader } from '../hooks/useUploader.js';
import { useFileActions } from '../hooks/useFileActions.js';
import { useRefresh } from '../hooks/useVault.js';
import { useUI } from '../stores/ui.js';

/** Timeline of versions with "upload new version" and "restore". */
export default function VersionHistory({ file, onChanged }) {
  const { data, refetch } = useQuery({ queryKey: ['versions', file.id, file.currentVersionId], queryFn: () => api('GET', `/files/${file.id}/versions`) });
  const upload = useUploader();
  const a = useFileActions();
  const refresh = useRefresh();
  const toast = useUI((s) => s.toast);
  const input = useRef(null);
  const restore = async (v) => {
    const { file: f } = await api('POST', `/files/${file.id}/versions/${v.id}/restore`);
    await refresh(); await refetch(); onChanged?.(f); toast(`Restored version ${v.number}`, 'success');
  };
  return (
    <div>
      <div className="row between" style={{ margin: '20px 0 6px' }}>
        <h3 style={{ fontSize: 15 }}>Version history</h3>
        <button type="button" className="btn sm" onClick={() => input.current.click()}><Upload className="i" /> New version</button>
        <input ref={input} type="file" hidden data-testid="version-input" onChange={async (e) => {
          const f = e.target.files[0]; e.target.value = '';
          if (f && await upload([f], { fileId: file.id })) { const r = await refetch(); const cur = r.data?.versions?.[0]; onChanged?.({ ...file, currentVersionId: cur?.id, size: cur?.size }); }
        }} />
      </div>
      {(data?.versions || []).map((v) => {
        const current = v.id === data.currentVersionId;
        return (
          <div className="ver" key={v.id} data-testid="version-row">
            <span className={`dot${current ? ' on' : ''}`} />
            <div style={{ flex: 1 }}>
              <b>Version {v.number}</b> {current && <span className="badge v">Current</span>}
              <div className="muted" style={{ fontSize: 12 }}>{formatDate(v.createdAt)} · {formatBytes(v.size)} · {v.device || 'Unknown device'}</div>
            </div>
            <button type="button" className="btn sm g" aria-label="Download this version" onClick={() => a.download(file, v.id)}><Download className="i" /></button>
            {!current && <button type="button" className="btn sm" onClick={() => restore(v)}><RotateCcw className="i" /> Restore</button>}
          </div>
        );
      })}
    </div>
  );
}
