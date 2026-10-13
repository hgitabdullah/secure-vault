import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

/** Centered glass dialog with backdrop; closes on Escape or backdrop click. */
export default function Modal({ title, subtitle, icon, onClose, children, width = 620 }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="ov" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <motion.div
        role="dialog" aria-modal="true" aria-label={title}
        className="glass modal" style={{ width }}
        initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.18 }}
      >
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div className="row">
            {icon && <div className="ficon t1">{icon}</div>}
            <div>
              <h2 style={{ fontSize: 20 }}>{title}</h2>
              {subtitle && <p className="muted" style={{ fontSize: 13 }}>{subtitle}</p>}
            </div>
          </div>
          <button type="button" className="btn sm g" onClick={onClose} aria-label="Close"><X className="i" /></button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}
