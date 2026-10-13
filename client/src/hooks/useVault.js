/**
 * TanStack Query hooks. Server data arrives with ENCRYPTED names; we decrypt
 * them with the in-memory master key right after fetching, so the rest of the
 * UI works with plain names – and search is purely client-side.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/http.js';
import { useAuth } from '../stores/auth.js';
import { decryptNames } from '../crypto/vault.js';

export function useListing(view, folderId) {
  const mk = useAuth((s) => s.masterKey);
  return useQuery({
    queryKey: ['files', view, folderId || null],
    enabled: !!mk,
    queryFn: async () => {
      const q = new URLSearchParams({ view });
      if (folderId) q.set('folder', folderId);
      const data = await api('GET', `/files?${q}`);
      const [files, folders] = await Promise.all([decryptNames(mk, data.files), decryptNames(mk, data.folders)]);
      return { ...data, files, folders };
    },
  });
}

/** Every folder (decrypted) – used for breadcrumbs, quick access and the move dialog. */
export function useAllFolders() {
  const mk = useAuth((s) => s.masterKey);
  return useQuery({
    queryKey: ['folders'],
    enabled: !!mk,
    queryFn: async () => decryptNames(mk, (await api('GET', '/folders')).folders),
  });
}

export function useShares() {
  const mk = useAuth((s) => s.masterKey);
  return useQuery({
    queryKey: ['shares'],
    enabled: !!mk,
    queryFn: async () => {
      const { shares } = await api('GET', '/shares');
      return decryptNames(mk, shares.map((s) => ({ ...s, encName: s.fileEncName, encMime: s.fileEncMime })));
    },
  });
}

/** Invalidate everything file-related after a mutation. */
export function useRefresh() {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: ['files'] }),
    qc.invalidateQueries({ queryKey: ['folders'] }),
    qc.invalidateQueries({ queryKey: ['shares'] }),
    qc.invalidateQueries({ queryKey: ['me'] }),
  ]);
}
