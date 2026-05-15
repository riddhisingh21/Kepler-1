const BASE_URL = import.meta.env.VITE_API_URL || "/api";
const TOKEN_KEY = "kepler.accessToken";
const REFRESH_KEY = "kepler.refreshToken";

export const auth = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  setTokens: (access, refresh) => {
    if (access) localStorage.setItem(TOKEN_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = auth.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  health: () => request("/health/"),
  register: (username, password, email = "") =>
    request("/auth/register/", {
      method: "POST",
      body: JSON.stringify({ username, password, email }),
    }),
  login: async (username, password) => {
    const data = await request("/auth/login/", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    auth.setTokens(data.access, data.refresh);
    return data;
  },
  logout: () => auth.clear(),
  me: () => request("/auth/me/"),
  chat: (message, sessionId) =>
    request("/chat/", {
      method: "POST",
      body: JSON.stringify({ message, session_id: sessionId }),
    }),
  history: (sessionId, pageSize = 200) => {
    const params = new URLSearchParams();
    if (sessionId) params.set("session_id", sessionId);
    if (pageSize) params.set("page_size", String(pageSize));
    const qs = params.toString();
    return request(`/history/${qs ? `?${qs}` : ""}`);
  },
  clearHistory: (sessionId) =>
    request(`/history/clear/${sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ""}`, {
      method: "DELETE",
    }),
  intents: () => request("/intents/"),
  intentDetail: (tag) => request(`/intents/${encodeURIComponent(tag)}/`),
  createIntent: (intent) =>
    request("/intents/", { method: "POST", body: JSON.stringify(intent) }),
  updateIntent: (tag, intent) =>
    request(`/intents/${encodeURIComponent(tag)}/`, {
      method: "PUT",
      body: JSON.stringify(intent),
    }),
  deleteIntent: (tag) =>
    request(`/intents/${encodeURIComponent(tag)}/`, { method: "DELETE" }),
  train: () => request("/train/", { method: "POST" }),
  feedback: (messageId, rating, comment = "") =>
    request("/feedback/", {
      method: "POST",
      body: JSON.stringify({ message: messageId, rating, comment }),
    }),
  stats: () => request("/stats/"),
  analytics: () => request("/analytics/"),
  evaluate: () => request("/evaluate/"),
  sessions: () => request("/sessions/"),
  deleteMessage: (id) => request(`/messages/${id}/`, { method: "DELETE" }),
};
