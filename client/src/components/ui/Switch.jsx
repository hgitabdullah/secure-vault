/** Accessible toggle switch styled like the mockups (.sw). */
export default function Switch({ checked, onChange, label, id }) {
  return (
    <span
      id={id} role="switch" aria-checked={!!checked} aria-label={label} tabIndex={0}
      className={`sw${checked ? ' on' : ''}`}
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange(!checked); } }}
    />
  );
}
