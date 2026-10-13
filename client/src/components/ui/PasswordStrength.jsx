import { Check, Circle } from 'lucide-react';
import { scorePassword } from '../../lib/password.js';

const LABELS = ['Too weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
const COLORS = ['var(--danger)', 'var(--danger)', 'var(--warn)', 'var(--success)', 'var(--success)'];

export default function PasswordStrength({ password }) {
  const { score, checks } = scorePassword(password);
  const item = (ok, text) => <span className={ok ? '' : 'x'}>{ok ? <Check className="i" /> : <Circle className="i" />}{text}</span>;
  return (
    <div>
      <div className="meter">{[0, 1, 2, 3].map((i) => <i key={i} className={i < score ? 'on' : ''} style={i < score ? { background: COLORS[score] } : undefined} />)}</div>
      <div className="row between" style={{ fontSize: 12, marginTop: 6 }}>
        <span className="muted">Password strength</span><b style={{ color: COLORS[score] }}>{password ? LABELS[score] : '—'}</b>
      </div>
      <div className="checks">
        {item(checks.length, '12+ characters')}{item(checks.number, 'Number')}{item(checks.symbol, 'Symbol')}{item(checks.upper, 'Upper & lowercase')}
      </div>
    </div>
  );
}
