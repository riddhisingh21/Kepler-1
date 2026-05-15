import { useCallback, useEffect, useRef, useState } from "react";

export default function useVoice({ onResult, onError } = {}) {
  const SR =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);
  const supported = !!SR;
  const recRef = useRef(null);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!supported) return;
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const text = e.results?.[0]?.[0]?.transcript ?? "";
      if (text && onResult) onResult(text);
    };
    rec.onerror = (e) => {
      setListening(false);
      if (onError) onError(e.error || "voice error");
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    return () => {
      try { rec.abort(); } catch (_) {}
      recRef.current = null;
    };
  }, [supported, onResult, onError]);

  const start = useCallback(() => {
    if (!recRef.current || listening) return;
    try {
      recRef.current.start();
      setListening(true);
    } catch (err) {
      if (onError) onError(String(err));
    }
  }, [listening, onError]);

  const stop = useCallback(() => {
    if (!recRef.current) return;
    try { recRef.current.stop(); } catch (_) {}
    setListening(false);
  }, []);

  return { supported, listening, start, stop };
}
