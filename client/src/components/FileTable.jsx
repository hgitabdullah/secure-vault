import { Lock, Link2, Star } from 'lucide-react';
import FileIcon from './FileIcon.jsx';
import FileMenu from './FileMenu.jsx';
import { formatBytes, formatDate } from '../lib/format.js';
import { useDialogs } from '../stores/ui.js';

/** List view: name, location, modified, size and encryption/share status. */
export default function FileTable({ files, sharedIds = new Set(), folderNames = {} }) {
  return (
    <div className="glass" style={{ borderRadius: 18, overflow: 'visible' }}>
      <table className="tb">
        <thead><tr><th>Name</th><th className="hide-sm">Location</th><th className="hide-sm">Modified</th><th>Size</th><th className="hide-sm">Status</th><th /></tr></thead>
        <tbody>
          {files.map((f) => (
            <tr key={f.id} data-testid="file-row" onClick={() => !f.trashed && useDialogs.getState().showDetails(f)}>
              <td><div className="row"><FileIcon file={f} /><b style={{ wordBreak: 'break-all' }}>{f.name}</b>{f.favorite && <Star className="i" style={{ width: 14, color: '#FCD34D', fill: '#FCD34D' }} />}</div></td>
              <td className="muted hide-sm">{f.folderId ? folderNames[f.folderId] || 'Folder' : 'My Files'}</td>
              <td className="muted hide-sm">{formatDate(f.trashed ? f.trashedAt : f.updatedAt)}</td>
              <td className="muted">{formatBytes(f.size)}</td>
              <td className="hide-sm">{sharedIds.has(f.id) ? <span className="badge v"><Link2 className="i" /> Shared</span> : <span className="badge"><Lock className="i" /> Encrypted</span>}</td>
              <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}><FileMenu file={f} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
