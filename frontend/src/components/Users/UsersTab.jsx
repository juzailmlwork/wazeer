import { useState, useEffect } from 'react';
import api from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';

const ROLE_LABELS = { super_admin: 'Super Admin', normal_admin: 'Normal Admin' };
const ROLE_COLORS = { super_admin: { bg: 'var(--primary-light)', color: 'var(--primary-dark)' }, normal_admin: { bg: '#f1f5f9', color: '#475569' } };

export default function UsersTab() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ username: '', name: '', password: '', role: 'normal_admin' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    try {
      const { data } = await api.get('/users');
      setUsers(data);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const { data } = await api.post('/users', form);
      setUsers([...users, data]);
      setForm({ username: '', name: '', password: '', role: 'normal_admin' });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, username) => {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/users/${id}`);
      setUsers(users.filter((u) => u._id !== id));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete user');
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20, alignItems: 'start' }}>
      {/* Form */}
      <div className="card">
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Create User</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Full Name</label>
            <input
              type="text"
              placeholder="e.g. John Doe"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Username</label>
            <input
              type="text"
              placeholder="e.g. johndoe"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value.trim() })}
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Min. 6 characters"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                minLength={6}
                required
                style={{ paddingRight: 70 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: 12, padding: 0,
                }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 20 }}>
            <label>Role</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { value: 'normal_admin', label: 'Normal Admin' },
                { value: 'super_admin', label: 'Super Admin' },
              ].map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setForm({ ...form, role: r.value })}
                  style={{
                    flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 13,
                    fontWeight: form.role === r.value ? 600 : 400,
                    background: form.role === r.value ? 'var(--primary)' : 'transparent',
                    color: form.role === r.value ? 'white' : 'var(--text-muted)',
                    border: form.role === r.value ? 'none' : '1px solid var(--border)',
                    cursor: 'pointer',
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="error-msg" style={{ marginBottom: 10 }}>{error}</p>}
          <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={saving}>
            {saving ? 'Creating...' : 'Create User'}
          </button>
        </form>
      </div>

      {/* Users table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>All Users</h2>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{users.length} users</span>
        </div>

        {loading ? (
          <div className="empty-state">Loading...</div>
        ) : users.length === 0 ? (
          <div className="empty-state">No users found.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id}>
                  <td style={{ fontWeight: 500 }}>{u.name}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{u.username}</td>
                  <td>
                    <span
                      className="badge"
                      style={{ background: ROLE_COLORS[u.role]?.bg, color: ROLE_COLORS[u.role]?.color }}
                    >
                      {ROLE_LABELS[u.role] || u.role}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td>
                    {u.username !== currentUser?.username && (
                      <button
                        className="btn-danger btn-sm"
                        onClick={() => handleDelete(u._id, u.username)}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
