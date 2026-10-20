import { useState } from 'react';
import api from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  // Left behind by the API layer when the server ended a session — a deleted account, or an
  // expired token. Shown once, then forgotten.
  const [signedOutReason] = useState(() => {
    try {
      const reason = localStorage.getItem('signedOutReason');
      localStorage.removeItem('signedOutReason');
      return reason || '';
    } catch {
      return '';
    }
  });
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', form);
      login(data.user, data.token, form.password);
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #dcfce7 0%, #f0fdf4 100%)',
    }}>
      <div style={{ width: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          {/* The lockup carries the name and the tagline, so there is no heading here. */}
          <img
            src="/logo.png"
            alt="FWR Recyclers — Green Beyond Belief"
            style={{ width: '100%', maxWidth: 300, height: 'auto', display: 'block', margin: '0 auto' }}
          />
        </div>

        <div className="card">
          <form onSubmit={handleSubmit}>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Username</label>
              <input
                type="text"
                placeholder="Enter username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
                autoFocus
              />
            </div>
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label>Password</label>
              <input
                type="password"
                placeholder="Enter password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>
            {!error && signedOutReason && (
              <div style={{ background: '#fef3c7', color: '#92400e', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>
                {signedOutReason}
              </div>
            )}
            {error && <p className="error-msg" style={{ marginBottom: 12 }}>{error}</p>}
            <button type="submit" className="btn-primary" style={{ width: '100%', padding: '10px' }} disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 16, fontSize: 12 }}>
          superadmin / admin123 &nbsp;·&nbsp; admin / admin123
        </p>
      </div>
    </div>
  );
}
