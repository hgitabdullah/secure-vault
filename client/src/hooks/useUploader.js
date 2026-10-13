/**
 * Upload queue: encrypts each file in the browser (8 MiB chunks) and uploads
 * it, updating progress in the UI store. Used by the upload modal and by
 * drag & drop anywhere on the page.
 */
import { useAuth } from '../stores/auth.js';
import { useUI } from '../stores/ui.js';
import { http } from '../api/http.js';
import { uploadFile } from '../crypto/vault.js';
import { useRefresh } from './useVault.js';

const fromBrowserFile = (f) => ({
  name: f.name, type: f.type, size: f.size,
  slice: async (a, b) => new Uint8Array(await f.slice(a, b).arrayBuffer()),
});

export function useUploader() {
  const refresh = useRefresh();
  return async function upload(fileList, { folderId = null, fileId = null } = {}) {
    const mk = useAuth.getState().masterKey;
    const ui = useUI.getState();
    const files = Array.from(fileList);
    let ok = 0;
    for (const f of files) {
      const id = `${Date.now()}-${Math.random()}`;
      ui.addUpload({ id, name: f.name, size: f.size, mime: f.type, progress: 0, phase: 'queued' });
      try {
        await uploadFile(http, mk, fromBrowserFile(f), {
          folderId, fileId,
          onProgress: (p) => useUI.getState().patchUpload(id, {
            phase: p.phase, chunk: p.chunk, chunkCount: p.chunkCount,
            progress: f.size ? Math.round((p.sent / f.size) * 100) : 100,
          }),
        });
        useUI.getState().patchUpload(id, { phase: 'done', progress: 100 });
        ok++;
      } catch (e) {
        useUI.getState().patchUpload(id, { phase: 'error', error: e.message });
        useUI.getState().toast(`${f.name}: ${e.message}`, 'error');
      }
    }
    await refresh();
    if (ok) useUI.getState().toast(`${ok} file${ok > 1 ? 's' : ''} encrypted & uploaded`, 'success');
    return ok;
  };
}
