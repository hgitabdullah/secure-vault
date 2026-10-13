import { create } from 'zustand';

/**
 * Auth + key store. IMPORTANT: everything here lives in memory only.
 * The master key is never written to localStorage/sessionStorage, so
 * reloading the page locks the vault and the user must unlock it again.
 */
export const useAuth = create((set) => ({
  user: null,
  accessToken: null,
  masterKey: null, // Uint8Array(32)
  pending: null, // sign-up waiting for the recovery-key confirmation
  setSession: (accessToken, user, masterKey) => set((s) => ({ accessToken, user, masterKey: masterKey ?? s.masterKey })),
  setUser: (user) => set({ user }),
  setToken: (accessToken) => set({ accessToken }),
  clear: () => set({ user: null, accessToken: null, masterKey: null, pending: null }),
  activatePending: () => set((s) => ({ accessToken: s.pending.accessToken, user: s.pending.user, masterKey: s.pending.masterKey, pending: null })),
}));
