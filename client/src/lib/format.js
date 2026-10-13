import {
  FileText, Image, Film, Music, FileCode, FileArchive, FileSpreadsheet, KeyRound, File as FileIcon, Presentation,
} from 'lucide-react';

/** 1536 → "1.5 KB" */
export function formatBytes(n = 0) {
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB', 'TB']; let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return `${n.toFixed(n >= 10 ? 0 : 1)} ${u[i]}`;
}

export function timeAgo(d) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 172800) return 'Yesterday';
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
export const formatDate = (d) => new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const ext = (name = '') => (name.includes('.') ? name.split('.').pop().toLowerCase() : '');

/**
 * Work out icon, colour tone (t1..t6 from the design) and preview type
 * from the decrypted mime type / file extension.
 */
export function fileKind(mime = '', name = '') {
  const e = ext(name);
  if (mime.startsWith('image/')) return { Icon: Image, tone: 't3', label: 'Image', preview: 'image' };
  if (mime.startsWith('video/')) return { Icon: Film, tone: 't2', label: 'Video', preview: 'video' };
  if (mime.startsWith('audio/')) return { Icon: Music, tone: 't6', label: 'Audio', preview: 'audio' };
  if (mime === 'application/pdf' || e === 'pdf') return { Icon: FileText, tone: 't1', label: 'PDF document', preview: 'pdf' };
  if (['env', 'pem', 'key', 'p12', 'kdbx'].includes(e)) return { Icon: KeyRound, tone: 't4', label: 'Secret / key', preview: 'text' };
  if (['zip', 'tar', 'gz', 'rar', '7z'].includes(e)) return { Icon: FileArchive, tone: 't6', label: 'Archive', preview: null };
  if (['xlsx', 'xls', 'csv', 'ods'].includes(e)) return { Icon: FileSpreadsheet, tone: 't5', label: 'Spreadsheet', preview: e === 'csv' ? 'text' : null };
  if (['ppt', 'pptx', 'key', 'odp'].includes(e)) return { Icon: Presentation, tone: 't4', label: 'Presentation', preview: null };
  if (['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'go', 'rs', 'html', 'css', 'json', 'sh', 'yml', 'yaml'].includes(e) || mime.includes('javascript') || mime.includes('json'))
    return { Icon: FileCode, tone: 't4', label: 'Source code', preview: 'text' };
  if (mime.startsWith('text/') || ['md', 'txt', 'log'].includes(e)) return { Icon: FileText, tone: 't1', label: 'Text document', preview: 'text' };
  if (['doc', 'docx', 'odt', 'rtf'].includes(e)) return { Icon: FileText, tone: 't1', label: 'Document', preview: null };
  return { Icon: FileIcon, tone: 't1', label: mime || 'File', preview: null };
}

export const categoryOf = (f) => {
  const p = fileKind(f.mime, f.name).preview;
  if (p === 'image') return 'images';
  if (p === 'video' || p === 'audio') return 'media';
  return 'documents';
};

export const initials = (name = '', email = '') =>
  (name || email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('') || 'SV';
