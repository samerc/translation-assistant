'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { api } from './api';
import { logger } from './logger';

interface UserRole {
  id: string;
  name: string;
  permissions: string[];
}

interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  isActive: boolean;
  colorPalette: string;
  darkMode: boolean;
  role: UserRole;
}

interface LoginResponse {
  user: AuthUser;
  accessToken: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutEverywhere: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      api
        .get<AuthUser>('/auth/profile')
        .then(setUser)
        .catch((err) => {
          logger.error('Profile fetch failed', err, 'auth');
          localStorage.removeItem('accessToken');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<LoginResponse>('/auth/login', { email, password });
    localStorage.setItem('accessToken', data.accessToken);
    // refreshToken is set as httpOnly cookie by the server — not stored in localStorage
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      logger.error('Logout request failed', err, 'auth');
    }
    localStorage.removeItem('accessToken');
    setUser(null);
  }, []);

  const logoutEverywhere = useCallback(async () => {
    try {
      await api.post('/auth/logout-everywhere');
    } catch (err) {
      logger.error('Logout everywhere failed', err, 'auth');
    }
    localStorage.removeItem('accessToken');
    setUser(null);
  }, []);

  const hasPermission = useCallback(
    (permission: string) => {
      if (!user) return false;
      return user.role.permissions.includes(permission);
    },
    [user],
  );

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, logoutEverywhere, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
