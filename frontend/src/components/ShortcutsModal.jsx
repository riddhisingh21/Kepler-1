const SHORTCUTS = [
  ["Enter", "Send message"],
  ["Shift + Enter", "New line"],
  ["Ctrl + K", "Focus the input"],
  ["Ctrl + L", "Clear the conversation"],
  ["Ctrl + F", "Search messages"],
  ["Ctrl + /", "Open this cheat sheet"],
  ["/help", "List slash commands"],
];

export default function ShortcutsModal({ onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Keyboard shortcuts"
      >
        <div className="modal-header">
          <h3>Keyboard shortcuts</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <table className="shortcuts">
          <tbody>
            {SHORTCUTS.map(([key, desc]) => (
              <tr key={key}>
                <td><kbd>{key}</kbd></td>
                <td>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
