import { useEffect, useRef, useState } from 'react';

/** Small popover menu. items: [{ label, icon, onClick, danger }] */
export default function Dropdown({ trigger, items, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }} onClick={(e) => e.stopPropagation()}>
      {trigger({ open, toggle: () => setOpen(!open) })}
      {open && (
        <div className="dropdown" role="menu" style={{ [align]: 0, top: '110%' }}>
          {items.filter(Boolean).map((it) => (
            <button type="button" role="menuitem" key={it.label} className={it.danger ? 'danger' : ''} onClick={() => { setOpen(false); it.onClick(); }}>
              {it.icon}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
