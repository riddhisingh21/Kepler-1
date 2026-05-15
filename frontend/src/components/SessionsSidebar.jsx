function relativeTime(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function SessionsSidebar({
  sessions,
  activeId,
  onPick,
  onNew,
  onClose,
}) {
  return (
    <aside className="sessions-sidebar" aria-label="Chat sessions">
      <div className="sessions-head">
        <strong>Sessions</strong>
        <button
          className="ghost"
          onClick={onClose}
          aria-label="Close sidebar"
          title="Close"
        >
          ×
        </button>
      </div>
      <button className="new-session-btn" onClick={onNew}>
        + New chat
      </button>
      <ul className="sessions-list">
        {sessions.length === 0 && (
          <li className="sessions-empty">No previous sessions yet.</li>
        )}
        {sessions.map((s) => (
          <li
            key={s.session_id}
            className={
              s.session_id === activeId
                ? "session-item active"
                : "session-item"
            }
          >
            <button
              type="button"
              className="session-btn"
              onClick={() => onPick(s.session_id)}
              title={s.session_id}
            >
              <div className="session-title">
                {s.last_user_text || "(empty)"}
              </div>
              <div className="session-meta">
                <span>{s.count} msg</span>
                <span>·</span>
                <span>{relativeTime(s.last_at)}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
