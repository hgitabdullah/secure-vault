import { create } from 'zustand';

/** Light/dark theme, persisted to localStorage (not sensitive). */
const initial = typeof localStorage !== 'undefined' && localStorage.getItem('sv-theme') === 'light' ? 'light' : 'dark';
export const useTheme = create((set) => ({
  theme: initial,
  setTheme: (theme) => {
    document.documentElement.classList.toggle('light', theme === 'light');
    localStorage.setItem('sv-theme', theme);
    set({ theme });
  },
}));
