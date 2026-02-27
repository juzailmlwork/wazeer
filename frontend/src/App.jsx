import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import Login from './components/Login.jsx';
import Layout from './components/Layout.jsx';

function AppContent() {
  const { user } = useAuth();
  return user ? <Layout /> : <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
