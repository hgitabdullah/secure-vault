import { useNavigate } from 'react-router-dom';
import { Search, Lock, Menu, LogOut, Settings, User } from 'lucide-react';
import ThemeToggle from './ui/ThemeToggle.jsx';
import Dropdown from './ui/Dropdown.jsx';
import { useUI } from '../stores/ui.js';
import { useAuth } from '../stores/auth.js';
import { logout } from '../api/auth.js';
import { initials } from '../lib/format.js';

/** Search box (client-side over decrypted names), vault status, theme and account menu. */
export default function Topbar() {
  const { search, setSearch, setSidebarOpen } = useUI();
  const user = useAuth((s) => s.user);
  const nav = useNavigate();
  return (
    <div className="top">
      <button type="button" className="iconbtn mobile-top" aria-label="Open menu" onClick={() => setSidebarOpen(true)}><Menu className="i" /></button>
      <div className="search">
        <Search className="i" />
        <input className="input" placeholder="Search your vault… (filenames are decrypted locally)" value={search}
          onChange={(e) => { setSearch(e.target.value); if (e.target.value) nav('/app/search'); }} aria-label="Search files" />
      </div>
      <div style={{ flex: 1 }} />
      <span className="badge hide-sm"><Lock className="i" /> Vault unlocked</span>
      <ThemeToggle />
      <Dropdown
        trigger={({ toggle }) => (
          <button type="button" className="av" style={{ border: 0, cursor: 'pointer' }} onClick={toggle} aria-label="Account menu">
            {initials(user?.name, user?.email)}
          </button>
        )}
        items={[
          { label: user?.email || 'Account', icon: <User className="i" />, onClick: () => nav('/app/settings') },
          { label: 'Settings', icon: <Settings className="i" />, onClick: () => nav('/app/settings') },
          { label: 'Lock & sign out', icon: <LogOut className="i" />, danger: true, onClick: async () => { await logout(); nav('/login'); } },
        ]}
      />
    </div>
  );
}
