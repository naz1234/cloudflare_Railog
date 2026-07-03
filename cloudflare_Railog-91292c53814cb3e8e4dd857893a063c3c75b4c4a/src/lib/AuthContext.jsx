import React, { createContext, useContext } from 'react';

const AuthContext = createContext();

const cloudflareUser = {
  id: 'cloudflare-user',
  role: 'admin',
  name: 'Cloudflare User',
  email: '',
};

export const AuthProvider = ({ children }) => {
  const checkUserAuth = async () => cloudflareUser;

  const value = {
    user: cloudflareUser,
    isAuthenticated: true,
    isLoadingAuth: false,
    isLoadingPublicSettings: false,
    authError: null,
    appPublicSettings: { public_settings: {} },
    authChecked: true,
    logout: () => {},
    navigateToLogin: () => {},
    checkUserAuth,
    checkAppState: async () => true,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
