import { useState } from "react";
import { useAuth } from "../AuthContext.jsx";

export default function AuthPanel() {
  const { user, login, register, logout } = useAuth();
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) {
    return (
      <div className="auth-pill">
        <span className="auth-user">@{user.username}</span>
        <button className="ghost" onClick={logout}>Sign out</button>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") {
        await login(username, password);
      } else {
        await register(username, password, email);
      }
      setUsername("");
      setPassword("");
      setEmail("");
    } catch (err) {
      setError(err.message.replace(/^API \d+: /, ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="auth-tabs">
        <button
          type="button"
          className={mode === "login" ? "auth-tab active" : "auth-tab"}
          onClick={() => setMode("login")}
        >
          Sign in
        </button>
        <button
          type="button"
          className={mode === "signup" ? "auth-tab active" : "auth-tab"}
          onClick={() => setMode("signup")}
        >
          Sign up
        </button>
      </div>
      <input
        type="text"
        placeholder="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoComplete="username"
        required
      />
      {mode === "signup" && (
        <input
          type="email"
          placeholder="email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      )}
      <input
        type="password"
        placeholder="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        minLength={6}
        required
      />
      {error && <div className="auth-error">{error}</div>}
      <button type="submit" className="primary" disabled={busy}>
        {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
      </button>
    </form>
  );
}
