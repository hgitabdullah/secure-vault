import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';

/** Brand mark: gradient shield + wordmark. */
export default function Logo({ to = '/' }) {
  return (
    <Link to={to} className="logo">
      <div className="m"><ShieldCheck className="i" /></div>SecureVault
    </Link>
  );
}
