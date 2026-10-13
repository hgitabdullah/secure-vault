import { useRef } from 'react';

/** Six single-digit boxes for TOTP codes; supports paste and backspace navigation. */
export default function OtpInput({ value, onChange }) {
  const refs = useRef([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || '');
  const set = (i, d) => {
    const next = digits.slice(); next[i] = d; onChange(next.join('').slice(0, 6));
    if (d && i < 5) refs.current[i + 1]?.focus();
  };
  return (
    <div className="otp" onPaste={(e) => { const t = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6); if (t) { e.preventDefault(); onChange(t); refs.current[Math.min(t.length, 5)]?.focus(); } }}>
      {digits.map((d, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }} inputMode="numeric" maxLength={1} value={d} aria-label={`Digit ${i + 1}`} autoFocus={i === 0}
          data-testid={`otp-${i}`}
          onChange={(e) => set(i, e.target.value.replace(/\D/g, '').slice(-1))}
          onKeyDown={(e) => { if (e.key === 'Backspace' && !d && i > 0) refs.current[i - 1]?.focus(); }} />
      ))}
    </div>
  );
}
