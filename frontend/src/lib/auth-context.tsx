'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { api, ApiError } from './api';
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
  /** Seeded admin still on the documented default password. */
  mustChangePassword?: boolean;
  role: UserRole;
  /** The organization the user works in; null for the platform admin. */
  tenant: { id: string; name: string; dateFormat: string } | null;
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
    const token = localStorage.getItem('accessToken');
    if (token) {
      api
        .get<AuthUser>('/auth/profile')
        .then(setUser)
        .catch((err) => {
          logger.error('Profile fetch failed', err, 'auth');
          // Only an auth failure invalidates the token — a 5xx/429/network blip
          // during a backend restart must not log the user out.
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
            localStorage.removeItem('accessToken');
          }
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
    localStorage.setItem('accessToken', data.accessToken);
    // refreshToken is set as httpOnly cookie by the server — not stored in localStorage
    setUser(data.user);
  }, [setUser]);

  // Registration logs the user in (access token in body, refresh cookie set).
  const register = useCallback(async (dto: RegisterData) => {
    const data = await api.post<LoginResponse>('/auth/register', dto);
    localStorage.setItem('accessToken', data.accessToken);
    setUser(data.user);
  }, [setUser]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      logger.error('Logout request failed', err, 'auth');
    }
    localStorage.removeItem('accessToken');
    setUser(null);
  }, [setUser]);

  const logoutEverywhere = useCallback(async () => {
    try {
      await api.post('/auth/logout-everywhere');
    } catch (err) {
      logger.error('Logout everywhere failed', err, 'auth');
    }
    localStorage.removeItem('accessToken');
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
