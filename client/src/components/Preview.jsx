import { useEffect, useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { fileKind } from '../lib/format.js';

/**
 * In-browser preview of a DECRYPTED file (object URL). Images, video, audio,
 * PDF and text are supported; other types show the file icon.
 */
export default function Preview({ file, state, big }) {
  const kind = fileKind(file.mime, file.name);
  const [text, setText] = useState('');
  useEffect(() => {
    if (kind.preview === 'text' && state.blob) state.blob.slice(0, 200_000).text().then(setText);
  }, [state.blob, kind.preview]);
  const { Icon } = kind;
  let body;
  if (state.loading) {
    body = <div style={{ textAlign: 'center' }}><Loader2 className="i spin" style={{ width: 32, height: 32 }} /><div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>Decrypting… {Math.round(state.progress * 100)}%</div></div>;
  } else if (state.error) {
    body = <div style={{ textAlign: 'center', padding: 20 }}>Could not decrypt: {state.error}</div>;
  } else if (state.url && kind.preview === 'image') body = <img src={state.url} alt={file.name} data-testid="preview-image" />;
  else if (state.url && kind.preview === 'video') body = <video src={state.url} controls style={{ width: '100%' }} />;
  else if (state.url && kind.preview === 'audio') body = <audio src={state.url} controls />;
  else if (state.url && kind.preview === 'pdf') body = <iframe src={state.url} title={file.name} sandbox="allow-scripts allow-same-origin" />;
  else if (state.url && kind.preview === 'text') body = <pre data-testid="preview-text">{text}</pre>;
  else {
    body = (
      <div style={{ textAlign: 'center' }}>
        <span style={{ display: 'inline-block', transform: 'scale(2.4)', marginBottom: 18 }}><Icon className="i" /></span>
        <div style={{ marginTop: 8, fontWeight: 700 }}>{file.name}</div>
        <div style={{ opacity: 0.7, fontSize: 12 }}>No preview for this type · download to open</div>
      </div>
    );
  }
  return (
    <div className={`prev${big ? ' big' : ''}`} data-testid="preview">
      {body}
      <span className="badge" style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(0,0,0,.45)' }}><Lock className="i" /> AES-256-GCM</span>
    </div>
  );
}
