import { useEffect, useState } from 'react';
import { http } from '../api/http.js';
import { useAuth } from '../stores/auth.js';
import { downloadFile } from '../crypto/vault.js';

/** Download + decrypt a file into a Blob object URL (revoked on unmount). */
export function useDecryptedFile(file, { enabled = true, versionId } = {}) {
  const [state, setState] = useState({ url: null, blob: null, loading: false, error: null, progress: 0 });
  useEffect(() => {
    if (!file || !enabled) return undefined;
    let url; let cancelled = false;
    setState({ url: null, blob: null, loading: true, error: null, progress: 0 });
    downloadFile(http, useAuth.getState().masterKey, file.id, {
      versionId,
      onProgress: (p) => !cancelled && setState((s) => ({ ...s, progress: p.size ? p.received / p.size : 1 })),
    })
      .then((chunks) => {
        if (cancelled) return;
        const blob = new Blob(chunks, { type: file.mime || 'application/octet-stream' });
        url = URL.createObjectURL(blob);
        setState({ url, blob, loading: false, error: null, progress: 1 });
      })
      .catch((e) => !cancelled && setState({ url: null, blob: null, loading: false, error: e.message, progress: 0 }));
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [file?.id, file?.currentVersionId, enabled, versionId]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

/** Trigger a browser download of a Blob. */
export function saveBlob(blob, name) {
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
