import Logo from '../components/ui/Logo.jsx';

/** Two-column auth screen: gradient story panel on the left, form card on the right. */
export default function AuthLayout({ side, footer, children }) {
  return (
    <div className="auth page">
      <div className="side">
        <Logo />
        <div>{side}</div>
        {footer || <span />}
      </div>
      <div className="form"><div className="glass box">{children}</div></div>
    </div>
  );
}
