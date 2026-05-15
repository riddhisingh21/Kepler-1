import Logo from "./Logo.jsx";

const SUGGESTIONS = [
  "Hello!",
  "What can you do?",
  "Tell me a joke",
  "Who made you?",
];

export default function EmptyState({ onPick }) {
  return (
    <div className="empty-state">
      <div className="empty-logo">
        <Logo size={72} />
      </div>
      <h2>How can I help today?</h2>
      <p>An NLP-powered chatbot. Ask me anything, or try one of these:</p>
      <div className="prompt-chips">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            className="prompt-chip"
            onClick={() => onPick(s)}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
