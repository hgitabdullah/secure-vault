import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Sparkles, Lock, PlayCircle, ArrowRight, FileText, Image, FileCode, Film, FileArchive, FileSpreadsheet, UploadCloud, ShieldCheck, Laptop,
  LockKeyhole, MonitorSmartphone, KeyRound, Link as LinkIcon, History, Cloud, Unlock, Check,
} from 'lucide-react';
import Logo from '../components/ui/Logo.jsx';
import ThemeToggle from '../components/ui/ThemeToggle.jsx';

const DEMO_FILES = [
  [FileText, 't1', 'Project-Plan.pdf', '2.4 MB'], [Image, 't3', 'passport-scan.png', '1.1 MB'], [FileCode, 't4', 'api-keys.env', '4 KB'],
  [Film, 't2', 'demo-video.mp4', '184 MB'], [FileArchive, 't6', 'website-src.zip', '48 MB'], [FileSpreadsheet, 't5', 'budget-2026.xlsx', '320 KB'],
];
const FEATURES = [
  [LockKeyhole, '', 'Zero-knowledge encryption', 'Files and filenames are encrypted in your browser with AES-256-GCM. We never see your keys.'],
  [UploadCloud, 'c', 'Drag & drop any file', 'Upload any file type with chunked uploads – every 8 MiB chunk is encrypted separately.'],
  [MonitorSmartphone, 's', 'Access from anywhere', 'Sign in on any computer and your vault is right there — no USB sticks, no emailing yourself.'],
  [KeyRound, 'vi', '2FA & recovery key', 'Authenticator-app codes, backup codes and a recovery key keep intruders out and you in.'],
  [LinkIcon, 'o', 'Secure sharing', "Share links with a password, expiry date and download limit — decrypted only in the recipient's browser."],
  [History, 'r', 'Versions & activity log', 'Restore older versions and see every sign-in, upload and share in one timeline.'],
];
const STEPS = [[KeyRound, '1. Derive your key', 'Your password becomes a key with Argon2id — on your device.'], [Lock, '2. Encrypt locally', 'Each file gets its own random AES-256 key before upload.'],
  [Cloud, '3. Store ciphertext', 'Only encrypted chunks reach storage. Names are encrypted too.'], [Unlock, '4. Decrypt anywhere', 'Sign in on any computer and files decrypt in your browser.']];
const PLANS = [
  ['Free', 'For personal essentials', '$0', '/mo', 'Start free', ['10 GB encrypted storage', '2FA & recovery key', 'Secure share links', 'Version history']],
  ['Pro', 'For power users', '$6', '/mo', 'Go Pro', ['1 TB encrypted storage', 'Passkeys (roadmap)', 'Unlimited share links', 'Desktop sync app (roadmap)'], true],
  ['Team', 'For small teams', '$12', '/user', 'Contact sales', ['5 TB pooled storage', 'Shared encrypted folders', 'Admin & audit logs', 'Priority support']],
];
const fade = { initial: { opacity: 0, y: 20 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { duration: 0.45 } };

/** Marketing landing page – matches mockups/index.html#landing. */
export default function Landing() {
  return (
    <div className="page" style={{ position: 'relative', zIndex: 1 }}>
      <nav className="nav">
        <Logo />
        <div className="links"><a href="#features">Features</a><a href="#security">Security</a><a href="#pricing">Pricing</a><a href="https://github.com" target="_blank" rel="noreferrer">Docs</a></div>
        <div className="row"><ThemeToggle className="btn g" /><Link className="btn g" to="/login">Log in</Link><Link className="btn p" to="/signup">Get started free <ArrowRight className="i" /></Link></div>
      </nav>
      <section className="hero">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <span className="pill"><Sparkles className="i" /> Zero-knowledge · AES-256 · Argon2id</span>
          <h1>Your files.<br /><span className="gt">Encrypted. Everywhere.</span></h1>
          <p className="lead">Upload anything — work files, photos, secret documents — and open them from any computer. Everything is encrypted in your browser before it leaves your device, so only you can read it.</p>
          <div className="row" style={{ marginTop: 32, gap: 14, flexWrap: 'wrap' }}>
            <Link className="btn p lg" to="/signup"><Lock className="i" /> Create your vault</Link>
            <Link className="btn lg" to="/login?demo=1"><PlayCircle className="i" /> Live demo</Link>
          </div>
          <div className="stats"><div><b>256-bit</b><span className="muted">AES-GCM encryption</span></div><div><b>0</b><span className="muted">Plaintext on our servers</span></div><div><b>10 GB</b><span className="muted">Free storage</span></div></div>
        </motion.div>
        <motion.div style={{ position: 'relative' }} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.1 }}>
          <div className="glass mock">
            <div className="bar"><i /><i /><i /></div>
            <div className="row between" style={{ marginBottom: 14 }}><b>My Files</b><span className="badge"><Lock className="i" /> End-to-end encrypted</span></div>
            <div className="fgrid" style={{ gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
              {DEMO_FILES.map(([Icon, t, n, s]) => (
                <div className="glass fc" key={n}><div className={`th ${t}`} style={{ height: 84 }}><Icon className="i" /><span className="lk"><Lock /></span></div><div className="nm">{n}</div><div className="mt">{s}</div></div>
              ))}
            </div>
            <div style={{ marginTop: 14 }} className="glass"><div style={{ padding: '12px 14px' }} className="row"><UploadCloud className="i" /><div style={{ flex: 1 }}>
              <div className="row between" style={{ fontSize: 12 }}><span>Encrypting &amp; uploading thesis-final.docx</span><span className="muted">72%</span></div>
              <div className="pb" style={{ margin: '6px 0 0' }}><motion.i initial={{ width: '8%' }} animate={{ width: '72%' }} transition={{ duration: 2.2 }} /></div></div></div></div>
          </div>
          <div className="glass float" style={{ left: -40, top: -22 }}><div className="ficon" style={{ background: 'rgba(16,185,129,.15)', color: '#10B981' }}><ShieldCheck className="i" /></div>2FA enabled</div>
          <div className="glass float" style={{ right: -20, bottom: 40 }}><div className="ficon" style={{ background: 'rgba(34,211,238,.15)', color: '#22D3EE' }}><Laptop className="i" /></div>Synced on 3 devices</div>
        </motion.div>
      </section>

      <section className="section" id="features">
        <h2>Everything you need, <span className="gt">nothing you don&apos;t</span></h2>
        <p className="sub">A fast, beautiful file vault built for people who move between computers all day.</p>
        <div className="grid3">
          {FEATURES.map(([Icon, c, t, d]) => <motion.div {...fade} className="glass feat" key={t}><div className={`ic ${c}`}><Icon className="i" /></div><h3>{t}</h3><p>{d}</p></motion.div>)}
        </div>
      </section>

      <section className="section" id="security">
        <h2>How your files stay <span className="gt">private</span></h2>
        <p className="sub">Encryption happens on your device. Our servers only ever store scrambled data.</p>
        <div className="steps">
          {STEPS.map(([Icon, t, d]) => <motion.div {...fade} className="glass step" key={t}><div className="n"><Icon className="i" /></div><h3>{t}</h3><p className="muted" style={{ marginTop: 6 }}>{d}</p></motion.div>)}
        </div>
      </section>

      <section className="section" id="pricing">
        <h2>Simple, honest <span className="gt">pricing</span></h2>
        <p className="sub">Start free. Upgrade when you need more space.</p>
        <div className="grid3" style={{ maxWidth: 1080, margin: 'auto' }}>
          {PLANS.map(([n, d, amt, per, cta, items, hl]) => (
            <motion.div {...fade} className={`glass price${hl ? ' hl' : ''}`} key={n}>
              {hl && <span className="badge v" style={{ position: 'absolute', top: 20, right: 20 }}>Most popular</span>}
              <h3>{n}</h3><p className="muted">{d}</p><div className="amt">{amt}<span className="muted" style={{ fontSize: 15 }}>{per}</span></div>
              <Link className={`btn w${hl ? ' p' : ''}`} to="/signup">{cta}</Link>
              <ul>{items.map((i) => <li key={i}><Check className="i" />{i}</li>)}</ul>
            </motion.div>
          ))}
        </div>
      </section>
      <footer>
        <div><Logo /><p className="muted" style={{ marginTop: 12, maxWidth: 320, lineHeight: 1.6 }}>Zero-knowledge encrypted storage for everyone who works across many computers.</p></div>
        <div><h4>Product</h4><a href="#features">Features</a><a href="#pricing">Pricing</a><Link to="/signup">Sign up</Link></div>
        <div><h4>Security</h4><a href="#security">How it works</a><Link to="/recover">Account recovery</Link></div>
        <div><h4>Company</h4><a href="#top">About</a><a href="#top">Privacy</a><a href="#top">Terms</a></div>
      </footer>
      <p className="muted" style={{ textAlign: 'center', padding: '0 0 40px', fontSize: 12 }}>© 2026 SecureVault. Built with MERN.</p>
    </div>
  );
}
