/** Friendly placeholder when a list is empty. */
export default function EmptyState({ icon, title, text, action }) {
  return (
    <div className="glass empty">
      <div className="big">{icon}</div>
      <h3 style={{ color: 'var(--text)', marginBottom: 6 }}>{title}</h3>
      <p style={{ marginBottom: action ? 16 : 0 }}>{text}</p>
      {action}
    </div>
  );
}
