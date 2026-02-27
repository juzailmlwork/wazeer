import { useState, useEffect } from 'react';
import api from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';

export default function SuppliersTab() {
  const { isSuperAdmin } = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', phone: '' });
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchSuppliers(); }, []);

  const fetchSuppliers = async () => {
    try {
      const { data } = await api.get('/suppliers');
      setSuppliers(data);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (editId) {
        const { data } = await api.put(`/suppliers/${editId}`, form);
        setSuppliers(suppliers.map((s) => (s._id === editId ? data : s)));
      } else {
        const { data } = await api.post('/suppliers', form);
        setSuppliers([...suppliers, data].sort((a, b) => a.name.localeCompare(b.name)));
      }
      setForm({ name: '', phone: '' });
      setEditId(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (s) => {
    setEditId(s._id);
    setForm({ name: s.name, phone: s.phone || '' });
    setError('');
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this supplier?')) return;
    try {
      await api.delete(`/suppliers/${id}`);
      setSuppliers(suppliers.filter((s) => s._id !== id));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete');
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>
      {/* Form */}
      <div className="card">
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
          {editId ? 'Edit Supplier' : 'Add Supplier'}
        </h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Name</label>
            <input
              type="text"
              placeholder="Supplier name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Phone <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
            <input
              type="tel"
              placeholder="+1 234 567 8900"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          {error && <p className="error-msg" style={{ marginBottom: 10 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={saving}>
              {saving ? 'Saving...' : editId ? 'Update' : 'Add Supplier'}
            </button>
            {editId && (
              <button type="button" className="btn-ghost" onClick={() => { setEditId(null); setForm({ name: '', phone: '' }); }}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Suppliers</h2>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{suppliers.length} suppliers</span>
        </div>
        {loading ? (
          <div className="empty-state">Loading...</div>
        ) : suppliers.length === 0 ? (
          <div className="empty-state">No suppliers yet. Add one!</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s._id}>
                  <td style={{ fontWeight: 500 }}>{s.name}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{s.phone || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn-ghost btn-sm" onClick={() => handleEdit(s)}>Edit</button>
                      {isSuperAdmin && (
                        <button className="btn-danger btn-sm" onClick={() => handleDelete(s._id)}>Delete</button>
                      )}
                    </div>
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
