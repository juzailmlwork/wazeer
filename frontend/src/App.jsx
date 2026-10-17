import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import Login from './components/Login.jsx';
import ChangePassword from './components/ChangePassword.jsx';
import Layout from './components/Layout.jsx';

function AppContent() {
  const { user } = useAuth();
  if (!user) return <Login />;
  // A password set by a super admin is good for this one sign-in. The backend refuses every
  // other route until it is replaced, so there is nothing else worth showing.
  if (user.mustChangePassword) return <ChangePassword />;
  return <Layout />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
