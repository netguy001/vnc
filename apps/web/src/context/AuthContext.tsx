import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserDTO } from '@server-console/shared';
import { api } from '../api/client';

interface AuthContextType {
  user: UserDTO | null;
  isLoading: boolean;
  isInitialized: boolean;
  login: (data: { username: string; password: string }) => Promise<void>;
  setup: (data: { username: string; password: string; email?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(true);

  const checkAuth = async () => {
    try {
      setIsLoading(true);
      // First check if setup is needed
      const status = await api.getSetupStatus();
      setIsInitialized(status.initialized);

      if (status.initialized) {
        // Attempt to fetch current user
        try {
          const res = await api.getMe();
          setUser(res.user);
        } catch {
          setUser(null);
        }
      }
    } catch (err) {
      console.error('Failed to verify authentication status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const login = async (data: { username: string; password: string }) => {
    const res = await api.login(data);
    setUser(res.user);
    setIsInitialized(true);
  };

  const setup = async (data: { username: string; password: string; email?: string }) => {
    const res = await api.setup(data);
    setUser(res.user);
    setIsInitialized(true);
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isInitialized,
        login,
        setup,
        logout,
        refreshAuth: checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
