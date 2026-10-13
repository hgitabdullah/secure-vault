import { motion } from 'framer-motion';
import { Lock, Star } from 'lucide-react';
import FileMenu from './FileMenu.jsx';
import { fileKind, formatBytes, timeAgo } from '../lib/format.js';
import { useDialogs } from '../stores/ui.js';

/** Grid tile for a file: type-coloured thumbnail, lock badge, name and meta. Draggable onto folders. */
export default function FileCard({ file }) {
  const { Icon, tone } = fileKind(file.mime, file.name);
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="glass fc" data-testid="file-card" draggable={!file.trashed}
      onDragStart={(e) => { e.dataTransfer.setData('application/x-sv-file', file.id); }}
      onClick={() => !file.trashed && useDialogs.getState().showDetails(file)}>
      <div className={`th ${tone}`}>
        <Icon className="i" />
        <span className="lk" title="Encrypted"><Lock /></span>
        {file.favorite && <Star className="i" style={{ position: 'absolute', top: 8, left: 8, width: 16, height: 16, fill: '#FCD34D', color: '#FCD34D' }} />}
      </div>
      <div className="nm" title={file.name}>{file.name}</div>
      <div className="mt">{formatBytes(file.size)} · {timeAgo(file.trashed ? file.trashedAt : file.updatedAt)}</div>
      <div className="menu-btn"><FileMenu file={file} /></div>
    </motion.div>
  );
}
