import { Link } from 'react-router-dom';
import Logo from '../components/ui/Logo.jsx';

export default function NotFound() {
  return (
    <div className="page" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
      <div className="glass" style={{ padding: 40 }}><Logo /><h1 style={{ margin: '20px 0 8px', fontSize: 48 }} className="gt">404</h1><p className="muted">This page doesn&apos;t exist.</p><Link className="btn p" to="/" style={{ marginTop: 20 }}>Go home</Link></div>
    </div>
  );
}
