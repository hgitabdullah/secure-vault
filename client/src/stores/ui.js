import { create } from 'zustand';

let nextId = 1;
/** UI store: toasts, upload queue, open dialogs, view mode. */
export const useUI = create((set, get) => ({
  toasts: [],
  toast: (message, kind = 'info') => {
    const id = nextId++;
    set({ toasts: [...get().toasts, { id, message, kind }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 4000);
  },
  uploads: [], // { id, name, size, mime, progress, phase, error }
  addUpload: (u) => set({ uploads: [...get().uploads, u] }),
  patchUpload: (id, patch) => set({ uploads: get().uploads.map((u) => (u.id === id ? { ...u, ...patch } : u)) }),
  clearUploads: () => set({ uploads: get().uploads.filter((u) => u.phase !== 'done' && u.phase !== 'error') }),
  uploadOpen: false,
  setUploadOpen: (uploadOpen) => set({ uploadOpen }),
  viewMode: localStorage.getItem('sv-view') || 'grid',
  setViewMode: (viewMode) => { localStorage.setItem('sv-view', viewMode); set({ viewMode }); },
  search: '',
  setSearch: (search) => set({ search }),
  sidebarOpen: false,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
}));

/**
 * Dialog host state: one dialog at a time.
 * type: 'prompt' | 'confirm' | 'share' | 'move' | null ; details = file shown in the side panel.
 */
export const useDialogs = create((set) => ({
  dialog: null,
  details: null,
  open: (type, props = {}) => set({ dialog: { type, props } }),
  close: () => set({ dialog: null }),
  showDetails: (file) => set({ details: file }),
  hideDetails: () => set({ details: null }),
}));
