import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Analytics from "./components/Analytics.jsx";
import AuthPanel from "./components/AuthPanel.jsx";
import ChatWindow from "./components/ChatWindow.jsx";
import InputBox from "./components/InputBox.jsx";
import IntentsAdmin from "./components/IntentsAdmin.jsx";
import Logo from "./components/Logo.jsx";
import ModelHealth from "./components/ModelHealth.jsx";
import SearchBar from "./components/SearchBar.jsx";
import SessionsSidebar from "./components/SessionsSidebar.jsx";
import ShortcutsModal from "./components/ShortcutsModal.jsx";
import { api } from "./api.js";
import { useAuth } from "./AuthContext.jsx";
import { useTheme } from "./Theme.jsx";
import { useToast } from "./Toast.jsx";
import { exportChat } from "./exportChat.js";
import { isSlashCommand, runSlashCommand } from "./slashCommands.js";

function rowsToMessages(rows) {
  const sorted = [...rows].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at),
  );
  const out = [];
  for (const r of sorted) {
    out.push({
      role: "user",
      text: r.user_text,
      id: `u-${r.id}`,
      pairId: r.id,
      sentiment: r.sentiment,
    });
    out.push({
      role: "bot",
      text: r.bot_response,
      id: r.id,
      intent: r.intent,
      confidence: r.confidence,
      fresh: false,
    });
  }
  return out;
}

const SESSION_KEY = "kepler.sessionId";

function newSessionId() {
  return "s-" + Math.random().toString(36).slice(2, 10);
}

function initialSessionId() {
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const sid = newSessionId();
  localStorage.setItem(SESSION_KEY, sid);
  return sid;
}

export default function App() {
  const [sessionId, setSessionId] = useState(initialSessionId);
  const { user } = useAuth();
  const { theme, toggle } = useTheme();
  const toast = useToast();
  const [tab, setTab] = useState("chat");
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [stats, setStats] = useState(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const inputRef = useRef(null);
  const messageRefs = useRef(new Map());

  const persistSession = useCallback((sid) => {
    localStorage.setItem(SESSION_KEY, sid);
    setSessionId(sid);
  }, []);

  const refreshSessions = useCallback(() => {
    api.sessions()
      .then((res) => setSessions(res?.sessions || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshSessions();
  }, [user?.id, refreshSessions]);

  useEffect(() => {
    api.stats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setHistoryLoaded(false);
    api
      .history(sessionId)
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res) ? res : res?.results || [];
        setMessages(rowsToMessages(rows));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHistoryLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, user?.id]);

  const matchIds = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const needle = searchQuery.toLowerCase();
    return messages
      .filter((m) => m.text && m.text.toLowerCase().includes(needle))
      .map((m) => m.id);
  }, [messages, searchQuery]);

  useEffect(() => {
    if (currentMatchIdx >= matchIds.length) setCurrentMatchIdx(0);
  }, [matchIds, currentMatchIdx]);

  useEffect(() => {
    if (!matchIds.length) return;
    const id = matchIds[currentMatchIdx];
    const el = messageRefs.current.get(id);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [matchIds, currentMatchIdx]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
    setCurrentMatchIdx(0);
  }, []);

  const stepMatch = useCallback(
    (delta) => {
      if (!matchIds.length) return;
      setCurrentMatchIdx((i) => (i + delta + matchIds.length) % matchIds.length);
    },
    [matchIds.length],
  );

  const handleClear = useCallback(async () => {
    try {
      await api.clearHistory(sessionId);
      toast.success("Conversation cleared");
    } catch (_) {
      toast.error("Could not clear history");
    }
    setMessages([]);
    refreshSessions();
  }, [sessionId, toast, refreshSessions]);

  const handleNewSession = useCallback(() => {
    const sid = newSessionId();
    persistSession(sid);
    setMessages([]);
    setSidebarOpen(false);
  }, [persistSession]);

  const handleSwitchSession = useCallback(
    (sid) => {
      if (!sid || sid === sessionId) return;
      persistSession(sid);
      setSidebarOpen(false);
    },
    [persistSession, sessionId],
  );

  const handleSend = useCallback(
    async (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const userMsg = {
        role: "user",
        text: trimmed,
        id: `u-${Date.now()}`,
      };
      setMessages((m) => [...m, userMsg]);

      if (isSlashCommand(trimmed)) {
        setSending(true);
        try {
          const res = await runSlashCommand(trimmed, {
            user,
            clear: handleClear,
          });
          setMessages((m) => [
            ...m,
            { role: "system", text: res.text, id: `sys-${Date.now()}` },
          ]);
        } catch (err) {
          toast.error(`Command failed: ${err.message}`);
        } finally {
          setSending(false);
        }
        return;
      }

      setSending(true);
      const startedAt = performance.now();
      try {
        const res = await api.chat(trimmed, sessionId);
        const clientMs = Math.round(performance.now() - startedAt);
        setMessages((m) => {
          const next = [...m];
          const lastUserIdx = next.map((x) => x.role).lastIndexOf("user");
          if (lastUserIdx >= 0) {
            next[lastUserIdx] = {
              ...next[lastUserIdx],
              id: `u-${res.id}`,
              pairId: res.id,
              sentiment: res.sentiment,
            };
          }
          next.push({
            role: "bot",
            text: res.response,
            id: res.id,
            intent: res.intent,
            confidence: res.confidence,
            suggestions: res.suggestions || [],
            latencyMs:
              typeof res.latency_ms === "number" ? res.latency_ms : clientMs,
            fresh: true,
          });
          return next;
        });
        refreshSessions();
      } catch (err) {
        toast.error(`Failed to send: ${err.message}`);
        setMessages((m) => [
          ...m,
          { role: "bot", text: `Error: ${err.message}`, id: `e-${Date.now()}` },
        ]);
      } finally {
        setSending(false);
      }
    },
    [sessionId, toast, user, handleClear, refreshSessions],
  );

  const handleEditAndRegenerate = useCallback(
    async (userMsg, newText) => {
      const trimmed = (newText || "").trim();
      if (!trimmed) return;
      const idx = messages.findIndex((m) => m.id === userMsg.id);
      if (idx < 0) return;
      const botAfter = messages[idx + 1];
      const next = messages.slice(0, idx);
      setMessages(next);
      if (userMsg.pairId) {
        try {
          await api.deleteMessage(userMsg.pairId);
        } catch (_) {}
      } else if (botAfter && typeof botAfter.id === "number") {
        try {
          await api.deleteMessage(botAfter.id);
        } catch (_) {}
      }
      handleSend(trimmed);
    },
    [messages, handleSend],
  );

  const handleExport = useCallback(
    (format) => {
      exportChat(messages, sessionId, format);
      toast.success(`Exported as ${format.toUpperCase()}`);
    },
    [messages, sessionId, toast],
  );

  useEffect(() => {
    function onKey(e) {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        handleClear();
      } else if (e.key === "/") {
        e.preventDefault();
        setShowShortcuts((s) => !s);
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        setTab("chat");
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClear]);

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <Logo size={36} />
          <div>
            <h1>Kepler 1</h1>
            <p className="tagline">An NLP-powered chatbot · Django + React</p>
          </div>
        </div>
        <div className="meta">
          {stats && <span className="badge">{stats.num_intents} intents</span>}
          {tab === "chat" && (
            <button
              className="ghost theme-toggle"
              onClick={() => setSidebarOpen((s) => !s)}
              aria-label="Toggle sessions sidebar"
              title="Sessions"
            >
              ☰
            </button>
          )}
          {tab === "chat" && (
            <button
              className="ghost theme-toggle"
              onClick={() => setSearchOpen((s) => !s)}
              aria-label="Search messages"
              title="Search messages (Ctrl+F)"
            >
              ⌕
            </button>
          )}
          {tab === "chat" && messages.length > 0 && (
            <div className="export-menu">
              <button
                className="ghost"
                onClick={() => handleExport("markdown")}
                title="Export as Markdown"
              >
                ⤓ .md
              </button>
              <button
                className="ghost"
                onClick={() => handleExport("json")}
                title="Export as JSON"
              >
                ⤓ .json
              </button>
            </div>
          )}
          {tab === "chat" && (
            <button className="ghost" onClick={handleClear}>Clear</button>
          )}
          <button
            className="ghost theme-toggle"
            onClick={() => setShowShortcuts(true)}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (Ctrl+/)"
          >
            ?
          </button>
          <button
            className="ghost theme-toggle"
            onClick={toggle}
            aria-label="Toggle theme"
            title={theme === "dark" ? "Switch to light" : "Switch to dark"}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </header>

      <nav className="tabs">
        <button
          className={tab === "chat" ? "tab active" : "tab"}
          onClick={() => setTab("chat")}
        >
          Chat
        </button>
        <button
          className={tab === "analytics" ? "tab active" : "tab"}
          onClick={() => setTab("analytics")}
        >
          Analytics
        </button>
        <button
          className={tab === "intents" ? "tab active" : "tab"}
          onClick={() => setTab("intents")}
        >
          Intents
        </button>
        <button
          className={tab === "health" ? "tab active" : "tab"}
          onClick={() => setTab("health")}
        >
          Model Health
        </button>
        <div className="tabs-spacer" />
        <AuthPanel />
      </nav>

      {tab === "chat" && (
        <div className={`chat-layout${sidebarOpen ? " with-sidebar" : ""}`}>
          {sidebarOpen && (
            <SessionsSidebar
              sessions={sessions}
              activeId={sessionId}
              onPick={handleSwitchSession}
              onNew={handleNewSession}
              onClose={() => setSidebarOpen(false)}
            />
          )}
          <div className="chat-main">
            {searchOpen && (
              <SearchBar
                query={searchQuery}
                onQueryChange={setSearchQuery}
                matches={matchIds}
                current={currentMatchIdx}
                onPrev={() => stepMatch(-1)}
                onNext={() => stepMatch(1)}
                onClose={closeSearch}
              />
            )}
            <ChatWindow
              messages={messages}
              sending={sending}
              onPickPrompt={handleSend}
              highlight={searchOpen ? searchQuery : ""}
              currentMatchId={matchIds[currentMatchIdx] ?? null}
              messageRefs={messageRefs}
              showEmptyState={historyLoaded}
              onEditRegenerate={handleEditAndRegenerate}
              onSuggestionPick={handleSend}
            />
            <InputBox ref={inputRef} onSend={handleSend} disabled={sending} />
            <footer className="footer">
              session: {sessionId}
              {user ? ` · signed in as @${user.username}` : " · anonymous"}
            </footer>
          </div>
        </div>
      )}
      {tab === "analytics" && <Analytics />}
      {tab === "intents" && <IntentsAdmin onStatsRefresh={setStats} />}
      {tab === "health" && <ModelHealth />}

      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}
