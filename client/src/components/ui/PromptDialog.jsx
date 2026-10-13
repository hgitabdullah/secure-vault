import { useState } from 'react';
import Modal from './Modal.jsx';

/** Ask for a single text value (new folder name, rename...). */
export default function PromptDialog({ title, label, initial = '', confirmText = 'Save', onSubmit, onClose }) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    try { await onSubmit(value.trim()); onClose(); } finally { setBusy(false); }
  };
  return (
    <Modal title={title} onClose={onClose} width={460}>
      <form onSubmit={submit}>
        <label className="l" htmlFor="prompt-input">{label}</label>
        <input id="prompt-input" className="input" value={value} onChange={(e) => setValue(e.target.value)} autoFocus maxLength={200}
          onFocus={(e) => { const i = e.target.value.lastIndexOf('.'); e.target.setSelectionRange(0, i > 0 ? i : e.target.value.length); }} />
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn p" disabled={busy || !value.trim()}>{confirmText}</button>
        </div>
      </form>
    </Modal>
  );
}
