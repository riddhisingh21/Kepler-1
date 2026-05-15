import { useEffect, useRef } from "react";

export default function SearchBar({
  query,
  onQueryChange,
  matches,
  current,
  onPrev,
  onNext,
  onClose,
}) {
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) onPrev();
      else onNext();
    }
  }

  const total = matches.length;
  const position = total === 0 ? 0 : current + 1;

  return (
    <div className="search-bar" role="search">
      <span className="search-icon" aria-hidden="true">⌕</span>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKey}
        placeholder="Search messages…"
        aria-label="Search messages"
      />
      <span className="search-count">
        {query ? `${position} / ${total}` : ""}
      </span>
      <button
        type="button"
        className="icon-btn"
        onClick={onPrev}
        disabled={total === 0}
        aria-label="Previous match"
        title="Previous match (Shift+Enter)"
      >
        ↑
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={onNext}
        disabled={total === 0}
        aria-label="Next match"
        title="Next match (Enter)"
      >
        ↓
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={onClose}
        aria-label="Close search"
        title="Close (Esc)"
      >
        ×
      </button>
    </div>
  );
}
