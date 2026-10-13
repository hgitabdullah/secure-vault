import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/** Password field with show/hide button. */
export default function PasswordInput({ value, onChange, id, placeholder, autoComplete = 'current-password', autoFocus }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input id={id} className="input" type={show ? 'text' : 'password'} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} autoFocus={autoFocus} style={{ paddingRight: 44 }} />
      <button type="button" className="muted" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}
        style={{ position: 'absolute', right: 10, top: 10, background: 'none', border: 0, cursor: 'pointer', color: 'var(--muted)' }}>
        {show ? <EyeOff className="i" /> : <Eye className="i" />}
      </button>
    </div>
  );
}
