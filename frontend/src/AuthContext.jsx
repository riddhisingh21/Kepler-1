import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, auth } from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.getToken()) {
      setLoading(false);
      return;
    }
    api.me()
      .then(setUser)
      .catch(() => auth.clear())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username, password) => {
    await api.login(username, password);
    const me = await api.me();
    setUser(me);
    return me;
  }, []);

  const register = useCallback(async (username, password, email) => {
    await api.register(username, password, email);
    return login(username, password);
  }, [login]);

  const logout = useCallback(() => {
    api.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
