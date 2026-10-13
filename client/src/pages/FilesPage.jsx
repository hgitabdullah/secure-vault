import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LayoutGrid, List, FolderPlus, Upload, Clock, Star, Trash2, Search, FolderOpen, ChevronRight } from 'lucide-react';
import FileCard from '../components/FileCard.jsx';
import FileTable from '../components/FileTable.jsx';
import FolderCard from '../components/FolderCard.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { useListing, useAllFolders, useShares } from '../hooks/useVault.js';
import { useFileActions } from '../hooks/useFileActions.js';
import { useUI } from '../stores/ui.js';
import { useAuth } from '../stores/auth.js';
import { categoryOf, formatBytes } from '../lib/format.js';

const TITLES = { folder: 'My Files', recent: 'Recent', favorites: 'Favorites', trash: 'Trash', search: 'Search results' };
const FILTERS = [['all', 'All'], ['documents', 'Documents'], ['images', 'Images'], ['media', 'Video & audio']];

/** "3 files · 1 folder" */
function folderMeta(f, all) {
  const subs = all.filter((x) => x.parentId === f.id).length;
  const parts = [`${f.fileCount ?? 0} file${f.fileCount === 1 ? '' : 's'}`];
  if (subs) parts.push(`${subs} folder${subs > 1 ? 's' : ''}`);
  return parts.join(' · ');
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/**
 * The main file browser. `view` comes from the route:
 * folder (root or /folder/:id), recent, favorites, trash, search.
 */
export default function FilesPage({ view = 'folder' }) {
  const { folderId } = useParams();
  const nav = useNavigate();
  const listView = view === 'search' ? 'all' : view;
  const { data, isLoading, error } = useListing(listView, folderId);
  const foldersQ = useAllFolders().data;
  const sharesQ = useShares().data;
  const allFolders = useMemo(() => foldersQ || [], [foldersQ]);
  const shares = useMemo(() => sharesQ || [], [sharesQ]);
  const { viewMode, setViewMode, setUploadOpen, search } = useUI();
  const user = useAuth((s) => s.user);
  const a = useFileActions();
  const [filter, setFilter] = useState('all');

  const sharedIds = useMemo(() => new Set(shares.filter((s) => s.status === 'active').map((s) => s.fileId)), [shares]);
  const folderNames = useMemo(() => Object.fromEntries(allFolders.map((f) => [f.id, f.name])), [allFolders]);

  // Breadcrumb trail built from the decrypted folder list.
  const trail = [];
  for (let id = folderId; id;) { const f = allFolders.find((x) => x.id === id); if (!f) break; trail.unshift(f); id = f.parentId; }
  const current = trail[trail.length - 1];

  let files = data?.files || [];
  let folders = data?.folders || [];
  if (view === 'search') {
    const q = search.trim().toLowerCase();
    files = q ? files.filter((f) => f.name.toLowerCase().includes(q)) : [];
    folders = q ? folders.filter((f) => f.name.toLowerCase().includes(q)) : [];
  }
  folders = [...folders].sort((x, y) => x.name.localeCompare(y.name));
  const shown = filter === 'all' ? files : files.filter((f) => categoryOf(f) === filter);
  const isRoot = view === 'folder' && !folderId;
  const firstName = (user?.name || '').split(' ')[0];

  const empty = {
    folder: { icon: <FolderOpen className="i" />, title: 'This folder is empty', text: 'Drop files anywhere on this page, or use the Upload button.' },
    recent: { icon: <Clock className="i" />, title: 'No recent files', text: 'Files you upload or change show up here.' },
    favorites: { icon: <Star className="i" />, title: 'No favorites yet', text: 'Star files to find them quickly.' },
    trash: { icon: <Trash2 className="i" />, title: 'Trash is empty', text: 'Deleted files stay here until you remove them permanently.' },
    search: { icon: <Search className="i" />, title: search ? `No results for "${search}"` : 'Type to search', text: 'Search runs on this device over your decrypted filenames.' },
  }[view];

  return (
    <div>
      <div className="ph">
        <div>
          <div className="crumb">
            <span style={{ cursor: 'pointer' }} onClick={() => nav('/app')}>Vault</span>
            {view !== 'folder' && <> / {TITLES[view]}</>}
            {view === 'folder' && <> / <span style={{ cursor: 'pointer' }} onClick={() => nav('/app')}>My Files</span></>}
            {trail.map((f) => <span key={f.id}> <ChevronRight className="i" style={{ width: 12 }} /> <span style={{ cursor: 'pointer' }} onClick={() => nav(`/app/folder/${f.id}`)}>{f.name}</span></span>)}
          </div>
          <h1 data-testid="page-title">{isRoot ? `${greeting()}${firstName ? `, ${firstName}` : ''} 👋` : current?.name || TITLES[view]}</h1>
        </div>
        <div className="row">
          <div className="seg" role="group" aria-label="View mode">
            <button type="button" className={viewMode === 'grid' ? 'on' : ''} onClick={() => setViewMode('grid')} aria-label="Grid view"><LayoutGrid className="i" /></button>
            <button type="button" className={viewMode === 'list' ? 'on' : ''} onClick={() => setViewMode('list')} aria-label="List view"><List className="i" /></button>
          </div>
          {view === 'folder' && <button type="button" className="btn" onClick={() => a.newFolder(folderId || null)}><FolderPlus className="i" /> New folder</button>}
          {view === 'trash' ? <button type="button" className="btn d" onClick={a.emptyTrash} disabled={!files.length && !folders.length}><Trash2 className="i" /> Empty trash</button>
            : <button type="button" className="btn p" onClick={() => setUploadOpen(true)}><Upload className="i" /> Upload</button>}
        </div>
      </div>

      {error && <p className="err">{error.message}</p>}
      {isLoading && <p className="muted">Decrypting your vault…</p>}

      {folders.length > 0 && (
        <div className="qa">
          {folders.map((f, i) => (
            <FolderCard key={f.id} folder={f} index={i}
              meta={f.trashed ? 'In trash' : folderMeta(f, allFolders)} />
          ))}
        </div>
      )}

      {data && (
        <>
          {files.length > 0 && (
            <div className="row between" style={{ marginBottom: 14 }}>
              <h3 style={{ fontSize: 16 }}>{isRoot ? 'Files' : `${files.length} file${files.length > 1 ? 's' : ''}`} <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>· {formatBytes(files.reduce((n, f) => n + f.size, 0))}</span></h3>
              <div className="row" style={{ gap: 8 }}>
                {FILTERS.map(([k, t]) => <button type="button" key={k} className={`btn sm${filter === k ? ' on' : ''}`} style={filter === k ? { borderColor: 'var(--primary)', background: 'rgba(99,102,241,.18)' } : undefined} onClick={() => setFilter(k)}>{t}</button>)}
              </div>
            </div>
          )}
          {shown.length > 0 && (viewMode === 'grid'
            ? <div className="fgrid">{shown.map((f) => <FileCard key={f.id} file={f} />)}</div>
            : <FileTable files={shown} sharedIds={sharedIds} folderNames={folderNames} />)}
          {files.length === 0 && folders.length === 0 && (
            <EmptyState {...empty} action={view === 'folder' ? <button type="button" className="btn p" onClick={() => setUploadOpen(true)}><Upload className="i" /> Upload files</button> : null} />
          )}
          {files.length > 0 && shown.length === 0 && <p className="muted">No files match this filter.</p>}
        </>
      )}
    </div>
  );
}
