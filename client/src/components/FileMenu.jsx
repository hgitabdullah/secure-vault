import { MoreHorizontal, Download, Share2, Star, Pencil, FolderInput, Trash2, RotateCcw, Info } from 'lucide-react';
import Dropdown from './ui/Dropdown.jsx';
import { useFileActions } from '../hooks/useFileActions.js';
import { useDialogs } from '../stores/ui.js';

/** "…" menu for a file. In the trash it offers restore / delete forever. */
export default function FileMenu({ file, className = 'btn sm g' }) {
  const a = useFileActions();
  const items = file.trashed
    ? [
      { label: 'Restore', icon: <RotateCcw className="i" />, onClick: () => a.restore(file) },
      { label: 'Delete forever', icon: <Trash2 className="i" />, danger: true, onClick: () => a.deleteForever(file) },
    ]
    : [
      { label: 'Details & preview', icon: <Info className="i" />, onClick: () => useDialogs.getState().showDetails(file) },
      { label: 'Download', icon: <Download className="i" />, onClick: () => a.download(file) },
      { label: 'Share link', icon: <Share2 className="i" />, onClick: () => a.share(file) },
      { label: file.favorite ? 'Unfavorite' : 'Add to favorites', icon: <Star className="i" />, onClick: () => a.toggleFavorite(file) },
      { label: 'Rename', icon: <Pencil className="i" />, onClick: () => a.rename(file) },
      { label: 'Move to…', icon: <FolderInput className="i" />, onClick: () => a.move(file, 'file') },
      { label: 'Move to trash', icon: <Trash2 className="i" />, danger: true, onClick: () => a.trash(file) },
    ];
  return (
    <Dropdown items={items} trigger={({ toggle }) => (
      <button type="button" className={className} aria-label={`Actions for ${file.name}`} onClick={toggle}><MoreHorizontal className="i" /></button>
    )} />
  );
}
