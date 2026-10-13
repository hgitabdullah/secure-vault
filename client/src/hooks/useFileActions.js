/**
 * All file/folder actions in one place, so cards, table rows, the details
 * panel and context menus behave identically. Names are encrypted with the
 * master key before they're sent to the server.
 */
import { api, http } from '../api/http.js';
import { useAuth } from '../stores/auth.js';
import { useUI, useDialogs } from '../stores/ui.js';
import { sealText } from '../crypto/core.js';
import { downloadFile } from '../crypto/vault.js';
import { saveBlob } from './useDecryptedFile.js';
import { useRefresh } from './useVault.js';

export function useFileActions() {
  const refresh = useRefresh();
  const toast = useUI((s) => s.toast);
  const { open } = useDialogs.getState();
  const mk = () => useAuth.getState().masterKey;
  const run = async (fn, okMsg) => {
    try { await fn(); await refresh(); if (okMsg) toast(okMsg, 'success'); } catch (e) { toast(e.message, 'error'); throw e; }
  };

  return {
    newFolder: (parentId = null) => open('prompt', {
      title: 'New folder', label: 'Folder name', confirmText: 'Create',
      onSubmit: (name) => run(async () => api('POST', '/folders', { encName: await sealText(mk(), name), parentId }), `Folder "${name}" created`),
    }),
    rename: (file) => open('prompt', {
      title: 'Rename file', label: 'New name', initial: file.name,
      onSubmit: (name) => run(async () => {
        await api('PATCH', `/files/${file.id}`, { encName: await sealText(mk(), name) });
        useDialogs.getState().details?.id === file.id && useDialogs.getState().showDetails({ ...file, name });
      }, 'Renamed'),
    }),
    renameFolder: (folder) => open('prompt', {
      title: 'Rename folder', label: 'New name', initial: folder.name,
      onSubmit: (name) => run(async () => api('PATCH', `/folders/${folder.id}`, { encName: await sealText(mk(), name) }), 'Folder renamed'),
    }),
    move: (item, kind = 'file') => open('move', { item, kind }),
    moveTo: (item, kind, folderId) => run(() => (kind === 'file'
      ? api('PATCH', `/files/${item.id}`, { folderId })
      : api('PATCH', `/folders/${item.id}`, { parentId: folderId })), 'Moved'),
    toggleFavorite: (file) => run(async () => {
      await api('PATCH', `/files/${file.id}`, { favorite: !file.favorite });
      if (useDialogs.getState().details?.id === file.id) useDialogs.getState().showDetails({ ...file, favorite: !file.favorite });
    }, file.favorite ? 'Removed from favorites' : 'Added to favorites'),
    trash: (file) => run(async () => { await api('DELETE', `/files/${file.id}`); useDialogs.getState().hideDetails(); }, 'Moved to trash'),
    trashFolder: (folder) => run(() => api('DELETE', `/folders/${folder.id}`), 'Folder moved to trash'),
    restore: (file) => run(() => api('POST', `/files/${file.id}/restore`), 'Restored'),
    restoreFolder: (folder) => run(() => api('POST', `/folders/${folder.id}/restore`), 'Folder restored'),
    deleteForever: (file) => open('confirm', {
      title: 'Delete permanently?', text: `"${file.name}" and all its versions will be erased. This cannot be undone.`,
      onConfirm: () => run(() => api('DELETE', `/files/${file.id}?permanent=true`), 'Deleted permanently'),
    }),
    deleteFolderForever: (folder) => open('confirm', {
      title: 'Delete folder permanently?', text: `"${folder.name}" and everything inside it will be erased. This cannot be undone.`,
      onConfirm: () => run(() => api('DELETE', `/folders/${folder.id}?permanent=true`), 'Folder deleted'),
    }),
    emptyTrash: () => open('confirm', {
      title: 'Empty trash?', text: 'All items in the trash will be permanently erased.', confirmText: 'Empty trash',
      onConfirm: () => run(() => api('DELETE', '/trash'), 'Trash emptied'),
    }),
    share: (file) => open('share', { file }),
    download: async (file, versionId) => {
      try {
        toast(`Decrypting ${file.name}…`);
        const chunks = await downloadFile(http, mk(), file.id, { versionId });
        saveBlob(new Blob(chunks, { type: file.mime }), file.name);
      } catch (e) { toast(e.message, 'error'); }
    },
  };
}
