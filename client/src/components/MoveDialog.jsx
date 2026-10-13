import { useState } from 'react';
import { Folder, Home, FolderInput } from 'lucide-react';
import Modal from './ui/Modal.jsx';
import { useAllFolders } from '../hooks/useVault.js';
import { useFileActions } from '../hooks/useFileActions.js';

/** Pick a destination folder (tree view). Folders can't be moved into themselves. */
export default function MoveDialog({ item, kind, onClose }) {
  const folders = useAllFolders().data || [];
  const a = useFileActions();
  const [target, setTarget] = useState(kind === 'file' ? item.folderId || null : item.parentId || null);
  // Exclude the folder itself and its descendants.
  const blocked = new Set();
  if (kind === 'folder') {
    blocked.add(item.id);
    let grew = true;
    while (grew) { grew = false; for (const f of folders) if (f.parentId && blocked.has(f.parentId) && !blocked.has(f.id)) { blocked.add(f.id); grew = true; } }
  }
  const render = (parentId, depth) => folders.filter((f) => (f.parentId || null) === parentId && !blocked.has(f.id))
    .sort((x, y) => x.name.localeCompare(y.name))
    .map((f) => (
      <div key={f.id}>
        <button type="button" className={`ni${target === f.id ? ' on' : ''}`} style={{ paddingLeft: 12 + depth * 18 }} onClick={() => setTarget(f.id)}><Folder className="i" />{f.name}</button>
        {render(f.id, depth + 1)}
      </div>
    ));
  return (
    <Modal title={`Move "${item.name}"`} subtitle="Choose a destination folder" icon={<FolderInput className="i" />} onClose={onClose} width={480}>
      <div className="sb" style={{ position: 'static', height: 'auto', maxHeight: 320, overflow: 'auto', border: 0, background: 'none', padding: '14px 0' }}>
        <button type="button" className={`ni${target === null ? ' on' : ''}`} onClick={() => setTarget(null)}><Home className="i" />My Files</button>
        {render(null, 1)}
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn p" onClick={async () => { await a.moveTo(item, kind, target); onClose(); }}>Move here</button>
      </div>
    </Modal>
  );
}
