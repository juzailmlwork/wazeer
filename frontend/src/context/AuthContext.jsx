import { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });

  // The password just typed at sign-in, held in memory only. It lets the forced-change screen
  // confirm the current password without making someone type what they typed a second ago.
  // Never written to storage, and dropped as soon as it is not needed.
  const [signInPassword, setSignInPassword] = useState(null);

  const login = (userData, token, password = null) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setSignInPassword(userData.mustChangePassword ? password : null);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setSignInPassword(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      login,
      logout,
      signInPassword,
      isSuperAdmin: user?.role === 'super_admin',
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
