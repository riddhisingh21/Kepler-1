import { forwardRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useAuth } from "../AuthContext.jsx";
import { useToast } from "../Toast.jsx";
import useTypewriter from "../hooks/useTypewriter.js";
import { api } from "../api.js";
import Logo from "./Logo.jsx";

function renderHighlighted(text, query) {
  if (!query) return text;
  const lower = text.toLowerCase();
  const needle = query.toLowerCase();
  const parts = [];
  let i = 0;
  while (i < text.length) {
    const found = lower.indexOf(needle, i);
    if (found === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (found > i) parts.push(text.slice(i, found));
    parts.push(
      <mark key={`m-${found}`} className="search-hit">
        {text.slice(found, found + needle.length)}
      </mark>,
    );
    i = found + needle.length;
  }
  return parts;
}

function sentimentLabel(score) {
  if (typeof score !== "number" || score === 0) return null;
  if (score >= 0.5) return { label: "very positive", cls: "sent pos-strong" };
  if (score > 0) return { label: "positive", cls: "sent pos" };
  if (score <= -0.5) return { label: "very negative", cls: "sent neg-strong" };
  return { label: "negative", cls: "sent neg" };
}

const Message = forwardRef(function Message(
  {
    message,
    animate = false,
    highlight = "",
    isCurrentMatch = false,
    isLastUser = false,
    onEditRegenerate,
    onSuggestionPick,
  },
  ref,
) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const { user } = useAuth();
  const toast = useToast();
  const [feedback, setFeedback] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text);
  const { shown, done } = useTypewriter(message.text, {
    enabled: !isUser && animate,
  });

  const display = isUser ? message.text : shown;
  const sent = isUser ? sentimentLabel(message.sentiment) : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.text);
      toast.success("Copied to clipboard");
    } catch (_) {
      toast.error("Copy failed");
    }
  }

  async function sendFeedback(rating) {
    if (feedback || !message.id || typeof message.id !== "number") return;
    setFeedback(rating);
    try {
      await api.feedback(message.id, rating);
      toast.success(rating >= 4 ? "Thanks for the upvote!" : "Thanks — we'll improve");
    } catch (err) {
      setFeedback(null);
      toast.error("Could not send feedback");
    }
  }

  const initial = isUser
    ? (user?.username?.[0] || "Y").toUpperCase()
    : null;

  const matchClass = isCurrentMatch ? " is-current-match" : "";

  if (isSystem) {
    return (
      <div ref={ref} className={`message system${matchClass}`}>
        <div className="bubble system-bubble">
          {highlight ? renderHighlighted(message.text, highlight) : (
            <ReactMarkdown>{message.text}</ReactMarkdown>
          )}
        </div>
      </div>
    );
  }

  const canEdit =
    isUser && isLastUser && onEditRegenerate && !!message.pairId;

  function submitEdit() {
    const next = draft.trim();
    if (!next) return;
    setEditing(false);
    onEditRegenerate(message, next);
  }

  return (
    <div ref={ref} className={`message ${isUser ? "user" : "bot"}${matchClass}`}>
      <div className="message-row">
        {!isUser && (
          <div className="avatar avatar-bot" aria-hidden="true">
            <Logo size={22} />
          </div>
        )}
        <div className="bubble">
          {isUser && editing ? (
            <div className="edit-bubble">
              <textarea
                className="edit-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submitEdit();
                  } else if (e.key === "Escape") {
                    setEditing(false);
                    setDraft(message.text);
                  }
                }}
                rows={Math.min(6, Math.max(2, draft.split("\n").length))}
                autoFocus
              />
              <div className="edit-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setEditing(false);
                    setDraft(message.text);
                  }}
                >
                  Cancel
                </button>
                <button type="button" onClick={submitEdit}>
                  Save & regenerate
                </button>
              </div>
            </div>
          ) : highlight ? (
            renderHighlighted(display, highlight)
          ) : isUser ? (
            display
          ) : (
            <ReactMarkdown
              components={{
                a: ({ node, ...p }) => (
                  <a {...p} target="_blank" rel="noopener noreferrer" />
                ),
              }}
            >
              {display}
            </ReactMarkdown>
          )}
          {!isUser && animate && !done && <span className="caret" />}
        </div>
        {isUser && (
          <div className="avatar avatar-user" aria-hidden="true">{initial}</div>
        )}
      </div>
      {isUser && (sent || canEdit) && (
        <div className="meta-line user-meta">
          {sent && (
            <span className={`sentiment-pill ${sent.cls}`} title="Sentiment">
              {sent.label}
            </span>
          )}
          {canEdit && !editing && (
            <button
              type="button"
              className="icon-btn"
              onClick={() => setEditing(true)}
              title="Edit & regenerate"
              aria-label="Edit message"
            >
              ✎
            </button>
          )}
        </div>
      )}
      {!isUser && message.intent && (
        <div className="meta-line">
          <span className="intent-pill">
            {message.intent}
            {typeof message.confidence === "number" &&
              ` · ${(message.confidence * 100).toFixed(0)}%`}
          </span>
          {typeof message.latencyMs === "number" && (
            <span className="latency-pill" title="Server response time">
              {message.latencyMs} ms
            </span>
          )}
          <div className="msg-actions">
            <button
              type="button"
              className="icon-btn"
              onClick={copy}
              title="Copy"
              aria-label="Copy message"
            >
              ⧉
            </button>
            <button
              type="button"
              className={`icon-btn ${feedback === 5 ? "active" : ""}`}
              onClick={() => sendFeedback(5)}
              disabled={!!feedback || typeof message.id !== "number"}
              title="Helpful"
              aria-label="Mark helpful"
            >
              ▲
            </button>
            <button
              type="button"
              className={`icon-btn ${feedback === 1 ? "active down" : ""}`}
              onClick={() => sendFeedback(1)}
              disabled={!!feedback || typeof message.id !== "number"}
              title="Not helpful"
              aria-label="Mark not helpful"
            >
              ▼
            </button>
          </div>
        </div>
      )}
      {!isUser && Array.isArray(message.suggestions) && message.suggestions.length > 0 && (
        <div className="suggestion-row">
          <span className="suggestion-label">Did you mean:</span>
          {message.suggestions.map((s) => (
            <button
              key={s.tag}
              type="button"
              className="suggestion-chip"
              onClick={() => onSuggestionPick?.(s.pattern)}
              title={`${s.tag} · ${(s.score * 100).toFixed(0)}%`}
            >
              {s.pattern}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

export default Message;
