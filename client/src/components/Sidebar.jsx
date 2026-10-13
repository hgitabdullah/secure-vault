import { NavLink, useNavigate } from 'react-router-dom';
import { Plus, FolderClosed, Clock, Star, Users, Trash2, Settings, Shield } from 'lucide-react';
import Logo from './ui/Logo.jsx';
import StorageMeter from './StorageMeter.jsx';
import { useUI } from '../stores/ui.js';
import { useShares } from '../hooks/useVault.js';

const NAV = [
  { to: '/app', label: 'My Files', icon: FolderClosed, end: true },
  { to: '/app/recent', label: 'Recent', icon: Clock },
  { to: '/app/favorites', label: 'Favorites', icon: Star },
  { to: '/app/shared', label: 'Shared', icon: Users, count: 'shares' },
  { to: '/app/trash', label: 'Trash', icon: Trash2 },
];

/** Left navigation: upload button, sections, account links and the storage meter. */
export default function Sidebar() {
  const { setUploadOpen, sidebarOpen, setSidebarOpen } = useUI();
  const shares = useShares();
  const active = (shares.data || []).filter((s) => s.status === 'active').length;
  const nav = useNavigate();
  const item = ({ to, label, icon: Icon, end, count }) => (
    <NavLink key={to} to={to} end={end} className={({ isActive }) => `ni${isActive ? ' on' : ''}`} onClick={() => setSidebarOpen(false)}>
      <Icon className="i" />{label}{count && active > 0 && <span className="ct">{active}</span>}
    </NavLink>
  );
  return (
    <aside className={`sb${sidebarOpen ? ' open' : ''}`}>
      <div style={{ padding: '0 8px 18px' }}><Logo to="/app" /></div>
      <button type="button" className="btn p w" style={{ marginBottom: 14 }} onClick={() => { setUploadOpen(true); setSidebarOpen(false); }}>
        <Plus className="i" /> Upload
      </button>
      {NAV.map(item)}
      <h5>Account</h5>
      {item({ to: '/app/settings', label: 'Settings', icon: Settings, end: true })}
      <button type="button" className="ni" onClick={() => { nav('/app/settings?tab=security'); setSidebarOpen(false); }}><Shield className="i" />Security</button>
      <StorageMeter />
    </aside>
  );
}
