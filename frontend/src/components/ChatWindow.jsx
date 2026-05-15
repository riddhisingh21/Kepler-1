import { useEffect, useRef } from "react";
import EmptyState from "./EmptyState.jsx";
import Message from "./Message.jsx";

export default function ChatWindow({
  messages,
  sending,
  onPickPrompt,
  highlight = "",
  currentMatchId = null,
  messageRefs,
  showEmptyState = true,
  onEditRegenerate,
  onSuggestionPick,
}) {
  const endRef = useRef(null);
  useEffect(() => {
    if (!highlight) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, highlight]);

  const lastBotId =
    [...messages].reverse().find((m) => m.role === "bot")?.id ?? null;
  const lastUserId =
    [...messages].reverse().find((m) => m.role === "user")?.id ?? null;

  return (
    <div className="chat-window">
      {showEmptyState && messages.length === 0 && (
        <EmptyState onPick={onPickPrompt} />
      )}
      {messages.map((m) => (
        <Message
          key={m.id}
          ref={
            messageRefs
              ? (el) => {
                  if (el) messageRefs.current.set(m.id, el);
                  else messageRefs.current.delete(m.id);
                }
              : undefined
          }
          message={m}
          animate={m.role === "bot" && m.id === lastBotId && !!m.fresh}
          highlight={highlight}
          isCurrentMatch={!!highlight && m.id === currentMatchId}
          isLastUser={m.role === "user" && m.id === lastUserId}
          onEditRegenerate={onEditRegenerate}
          onSuggestionPick={onSuggestionPick}
        />
      ))}
      {sending && (
        <div className="message bot">
          <div className="message-row">
            <div className="avatar avatar-bot" aria-hidden="true" />
            <div className="bubble typing">
              <span /><span /><span />
            </div>
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
