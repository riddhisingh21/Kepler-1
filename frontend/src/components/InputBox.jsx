import { forwardRef, useCallback, useState } from "react";
import { useToast } from "../Toast.jsx";
import useVoice from "../hooks/useVoice.js";

const InputBox = forwardRef(function InputBox({ onSend, disabled }, ref) {
  const [value, setValue] = useState("");
  const toast = useToast();

  const handleVoiceResult = useCallback(
    (text) => {
      setValue((v) => (v ? `${v} ${text}` : text));
    },
    [],
  );
  const handleVoiceError = useCallback(
    (err) => toast.error(`Voice: ${err}`),
    [toast],
  );
  const { supported, listening, start, stop } = useVoice({
    onResult: handleVoiceResult,
    onError: handleVoiceError,
  });

  function submit(e) {
    e.preventDefault();
    if (!value.trim() || disabled) return;
    onSend(value);
    setValue("");
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(e);
    }
  }

  return (
    <form className="input-box" onSubmit={submit}>
      <textarea
        ref={ref}
        rows={1}
        placeholder={listening ? "Listening…" : "Type a message (/help for commands)…"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        autoFocus
      />
      {supported && (
        <button
          type="button"
          className={`mic-btn ${listening ? "listening" : ""}`}
          onClick={listening ? stop : start}
          disabled={disabled}
          aria-label={listening ? "Stop voice input" : "Start voice input"}
          title={listening ? "Stop" : "Voice input"}
        >
          {listening ? "■" : "🎤"}
        </button>
      )}
      <button type="submit" disabled={disabled || !value.trim()}>
        Send
      </button>
    </form>
  );
});

export default InputBox;
