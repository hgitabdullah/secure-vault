import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './stores/auth.js';
import AppShell from './components/AppShell.jsx';
import Toasts from './components/ui/Toasts.jsx';
import Landing from './pages/Landing.jsx';
import Signup from './pages/Signup.jsx';
import RecoveryKey from './pages/RecoveryKey.jsx';
import Login from './pages/Login.jsx';
import Recover from './pages/Recover.jsx';
import FilesPage from './pages/FilesPage.jsx';
import SharedPage from './pages/SharedPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import PublicShare from './pages/PublicShare.jsx';
import NotFound from './pages/NotFound.jsx';

/** Only render the vault when we have a session AND the master key in memory. */
function RequireVault({ children }) {
  const { accessToken, masterKey } = useAuth();
  const loc = useLocation();
  if (!accessToken || !masterKey) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return children;
}
/** Logged-in users skip the login/signup pages. */
function GuestOnly({ children }) {
  const { accessToken, masterKey } = useAuth();
  return accessToken && masterKey ? <Navigate to="/app" replace /> : children;
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signup" element={<GuestOnly><Signup /></GuestOnly>} />
        <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
        <Route path="/recover" element={<Recover />} />
        <Route path="/recovery-key" element={<RecoveryKey />} />
        <Route path="/s/:token" element={<PublicShare />} />
        <Route path="/app" element={<RequireVault><AppShell /></RequireVault>}>
          <Route index element={<FilesPage view="folder" />} />
          <Route path="folder/:folderId" element={<FilesPage view="folder" />} />
          <Route path="recent" element={<FilesPage view="recent" />} />
          <Route path="favorites" element={<FilesPage view="favorites" />} />
          <Route path="trash" element={<FilesPage view="trash" />} />
          <Route path="search" element={<FilesPage view="search" />} />
          <Route path="shared" element={<SharedPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toasts />
    </>
  );
}
