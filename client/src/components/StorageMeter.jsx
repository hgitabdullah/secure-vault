import { useQuery } from '@tanstack/react-query';
import { api } from '../api/http.js';
import { formatBytes } from '../lib/format.js';

/** Storage used vs. quota with the gradient progress bar. */
export default function StorageMeter() {
  const { data } = useQuery({ queryKey: ['me'], queryFn: () => api('GET', '/auth/me') });
  const used = data?.user.storageUsed || 0;
  const quota = data?.user.storageQuota || 1;
  const pct = Math.min(100, (used / quota) * 100);
  return (
    <div className="glass storage" data-testid="storage-meter">
      <div className="row between" style={{ fontSize: 13 }}><b>Storage</b><span className="muted">{pct < 1 && used > 0 ? '<1' : Math.round(pct)}%</span></div>
      <div className="pb"><i style={{ width: `${Math.max(pct, used ? 1 : 0)}%` }} /></div>
      <span className="muted" style={{ fontSize: 12 }}>{formatBytes(used)} of {formatBytes(quota)} used</span>
    </div>
  );
}
