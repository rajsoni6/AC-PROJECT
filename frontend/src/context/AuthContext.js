import React, { createContext, useContext, useState, useEffect } from "react";
import { authAPI } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [meLoading, setMeLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (token) {
      authAPI.me()
        .then((res) => setUser(res.data))
        .catch(() => localStorage.removeItem("access_token"))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (tokenData) => {
    localStorage.setItem("access_token", tokenData.access_token);
    localStorage.setItem("refresh_token", tokenData.refresh_token);
    setMeLoading(true);
    try {
      const res = await authAPI.me();
      setUser(res.data);
    } catch (_) {
      setUser({
        id: tokenData.user_id,
        full_name: tokenData.full_name,
        role: tokenData.role,
        is_verified: false,
      });
    } finally {
      setMeLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading: loading || meLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
