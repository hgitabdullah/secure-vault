import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Folder, MoreHorizontal, Pencil, FolderInput, Trash2, RotateCcw } from 'lucide-react';
import Dropdown from './ui/Dropdown.jsx';
import { useFileActions } from '../hooks/useFileActions.js';

const TONES = ['t1', 't3', 't4', 't6', 't5', 't2'];

/** Folder tile. Click to open; drop a file card on it to move the file inside. */
export default function FolderCard({ folder, index = 0, meta }) {
  const nav = useNavigate();
  const a = useFileActions();
  const [over, setOver] = useState(false);
  const items = folder.trashed
    ? [{ label: 'Restore', icon: <RotateCcw className="i" />, onClick: () => a.restoreFolder(folder) },
      { label: 'Delete forever', icon: <Trash2 className="i" />, danger: true, onClick: () => a.deleteFolderForever(folder) }]
    : [{ label: 'Rename', icon: <Pencil className="i" />, onClick: () => a.renameFolder(folder) },
      { label: 'Move to…', icon: <FolderInput className="i" />, onClick: () => a.move(folder, 'folder') },
      { label: 'Move to trash', icon: <Trash2 className="i" />, danger: true, onClick: () => a.trashFolder(folder) }];
  return (
    <div className={`glass folder${over ? ' drop-target' : ''}`} data-testid="folder-card"
      onClick={() => !folder.trashed && nav(`/app/folder/${folder.id}`)}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-sv-file')) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { const id = e.dataTransfer.getData('application/x-sv-file'); setOver(false); if (id) { e.preventDefault(); e.stopPropagation(); a.moveTo({ id }, 'file', folder.id); } }}>
      <div className={`ficon ${TONES[index % TONES.length]}`}><Folder className="i" /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{folder.name}</b>
        <div className="muted" style={{ fontSize: 12 }}>{meta || 'Encrypted folder'}</div>
      </div>
      <Dropdown items={items} trigger={({ toggle }) => (
        <button type="button" className="btn sm g" aria-label={`Actions for folder ${folder.name}`} onClick={toggle}><MoreHorizontal className="i" /></button>
      )} />
    </div>
  );
}
