import { useState } from 'react';
import api from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';

const MIN_LENGTH = 6;

// Shown instead of the app when the signed-in user is still on a password someone else chose
// for them. The only ways out are setting a password or signing out.
export default function ChangePassword() {
  const { user, login, logout, signInPassword } = useAuth();

  // After a page reload the password typed at sign-in is gone, so it has to be asked for.
  const askForCurrent = !signInPassword;

  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.next.length < MIN_LENGTH) return setError(`Your new password must be at least ${MIN_LENGTH} characters`);
    if (form.next !== form.confirm) return setError('The two new passwords do not match');

    setSaving(true);
    try {
      const { data } = await api.post('/auth/change-password', {
        currentPassword: askForCurrent ? form.current : signInPassword,
        newPassword: form.next,
      });
      // The response carries a fresh token without the one-time flag, which unlocks the app.
      login(data.user, data.token);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not change your password');
    } finally {
      setSaving(false);
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
      <div style={{ width: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, background: 'var(--primary)', borderRadius: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: 28,
          }}>
            🔑
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>Choose your password</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: 14 }}>
            Hi {user?.name} — the password you signed in with was set for you and works once.
            Pick one only you know to continue.
          </p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit}>
            {askForCurrent && (
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>Current password</label>
                <input
                  type="password"
                  placeholder="The password you were given"
                  value={form.current}
                  onChange={set('current')}
                  required
                  autoFocus
                />
              </div>
            )}
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>New password</label>
              <input
                type="password"
                placeholder={`At least ${MIN_LENGTH} characters`}
                value={form.next}
                onChange={set('next')}
                required
                autoFocus={!askForCurrent}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label>Confirm new password</label>
              <input
                type="password"
                placeholder="Type it again"
                value={form.confirm}
                onChange={set('confirm')}
                required
              />
            </div>
            {error && <p className="error-msg" style={{ marginBottom: 12 }}>{error}</p>}
            <button type="submit" className="btn-primary" style={{ width: '100%', padding: '10px' }} disabled={saving}>
              {saving ? 'Saving…' : 'Set password and continue'}
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button className="btn-ghost btn-sm" onClick={logout}>Sign out instead</button>
        </div>
      </div>
    </div>
  );
}
