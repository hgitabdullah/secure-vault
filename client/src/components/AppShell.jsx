import { useState } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { UploadCloud } from 'lucide-react';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import DialogHost from './DialogHost.jsx';
import { useUploader } from '../hooks/useUploader.js';
import { useUI } from '../stores/ui.js';

/**
 * Logged-in layout: sidebar + top bar + page. Dropping files from the
 * desktop anywhere on the page uploads them into the current folder.
 */
export default function AppShell() {
  const { folderId } = useParams();
  const upload = useUploader();
  const [dragging, setDragging] = useState(false);
  const { setUploadOpen, sidebarOpen, setSidebarOpen } = useUI();
  const isFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
  return (
    <div className="app"
      onDragOver={(e) => { if (isFiles(e)) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (!e.relatedTarget) setDragging(false); }}
      onDrop={(e) => {
        if (!isFiles(e)) return;
        e.preventDefault(); setDragging(false);
        if (e.dataTransfer.files.length) { setUploadOpen(true); upload(e.dataTransfer.files, { folderId: folderId || null }); }
      }}>
      <Sidebar />
      {sidebarOpen && <div className="ov" style={{ zIndex: 44 }} onClick={() => setSidebarOpen(false)} />}
      <main className="main">
        <Topbar />
        <Outlet />
      </main>
      <DialogHost folderId={folderId || null} />
      {dragging && (
        <div className="dropzone-overlay">
          <div className="glass" style={{ padding: 40, textAlign: 'center' }}>
            <div className="drop" style={{ margin: 0 }}><div className="big"><UploadCloud className="i" /></div><b style={{ fontSize: 18 }}>Drop to encrypt &amp; upload</b></div>
          </div>
        </div>
      )}
    </div>
  );
}
