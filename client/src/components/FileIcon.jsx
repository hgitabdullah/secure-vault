import { fileKind } from '../lib/format.js';

/** Coloured square icon for a file type (uses the design's t1..t6 tones). */
export default function FileIcon({ file, size = 36 }) {
  const { Icon, tone } = fileKind(file.mime, file.name);
  return <div className={`ficon ${tone}`} style={{ width: size, height: size }}><Icon className="i" /></div>;
}
