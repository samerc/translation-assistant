'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { api, ApiError, maybeSignedIn, restoreSession, setAccessToken } from './api';
import { logger } from './logger';
import { setDateFormat } from './format';

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
  /** Daily reminder email (deadlines, overdue invoices). */
  emailReminders?: boolean;
  /** Seeded admin still on the documented default password. */
  mustChangePassword?: boolean;
  role: UserRole;
  /** The organization the user works in; null for the platform admin. */
  /** pricesHidden: a Translator of an organization that hides prices (the API leaves them out). */
  tenant: { id: string; name: string; dateFormat: string; pricesHidden?: boolean } | null;
  /** Manages organizations and platform settings; sees no organization's data. */
  isPlatformAdmin: boolean;
}

interface LoginResponse {
  user: AuthUser;
  accessToken: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  logoutEverywhere: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  /** Re-read the profile (e.g. after the organization's date format changed). */
  refreshUser: () => Promise<void>;
}

export interface RegisterData {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  inviteToken: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  // Dates everywhere follow the organization's format: set it before the re-render.
  const setUser = useCallback((u: AuthUser | null) => {
    setDateFormat(u?.tenant?.dateFormat);
    setUserState(u);
  }, []);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (maybeSignedIn()) {
      // The access token is kept in memory only: a reload gets a new one from the
      // refresh cookie, then the profile.
      restoreSession()
        .then(async (result) => {
          // 'error' (offline, server restarting): stay signed out for now but keep
          // the hint, so the next load tries again.
          if (result === 'denied') setAccessToken(null);
          if (result !== 'ok') return;
          setUser(await api.get<AuthUser>('/auth/profile'));
        })
        .catch((err) => {
          logger.error('Profile fetch failed', err, 'auth');
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) setAccessToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      // localStorage only exists after hydration, so this must run in an effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
    }
  }, [setUser]);

  const refreshUser = useCallback(async () => {
    setUser(await api.get<AuthUser>('/auth/profile'));
  }, [setUser]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<LoginResponse>('/auth/login', { email, password });
    setAccessToken(data.accessToken); // memory only; the refresh token is an httpOnly cookie
    setUser(data.user);
  }, [setUser]);

  // Registration logs the user in (access token in body, refresh cookie set).
  const register = useCallback(async (dto: RegisterData) => {
    const data = await api.post<LoginResponse>('/auth/register', dto);
    setAccessToken(data.accessToken);
    setUser(data.user);
  }, [setUser]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      logger.error('Logout request failed', err, 'auth');
    }
    setAccessToken(null);
    setUser(null);
  }, [setUser]);

  const logoutEverywhere = useCallback(async () => {
    try {
      await api.post('/auth/logout-everywhere');
    } catch (err) {
      logger.error('Logout everywhere failed', err, 'auth');
    }
    setAccessToken(null);
    setUser(null);
  }, [setUser]);

  const hasPermission = useCallback(
    (permission: string) => {
      if (!user) return false;
      return user.role.permissions.includes(permission);
    },
    [user],
  );

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, logoutEverywhere, hasPermission, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
