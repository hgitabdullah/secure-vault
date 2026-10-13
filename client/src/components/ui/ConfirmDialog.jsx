import { useState } from 'react';
import Modal from './Modal.jsx';

/** Yes/no confirmation for destructive actions. */
export default function ConfirmDialog({ title, text, confirmText = 'Delete', danger = true, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose} width={460}>
      <p className="muted" style={{ marginTop: 14, lineHeight: 1.6 }}>{text}</p>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 22 }}>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className={`btn ${danger ? 'd' : 'p'}`} disabled={busy}
          onClick={async () => { setBusy(true); try { await onConfirm(); onClose(); } finally { setBusy(false); } }}>{confirmText}</button>
      </div>
    </Modal>
  );
}
