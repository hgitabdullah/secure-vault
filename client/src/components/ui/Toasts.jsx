import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { useUI } from '../../stores/ui.js';

/** Bottom-right notifications from useUI().toast(). */
export default function Toasts() {
  const toasts = useUI((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} className={`toast ${t.kind}`} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }}>
            {t.kind === 'success' ? <CheckCircle2 className="i" style={{ color: 'var(--success)' }} />
              : t.kind === 'error' ? <AlertTriangle className="i" style={{ color: 'var(--danger)' }} /> : <Info className="i" style={{ color: 'var(--accent)' }} />}
            <span>{t.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
