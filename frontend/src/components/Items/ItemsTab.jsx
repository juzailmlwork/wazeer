import { useState, useEffect } from 'react';
import api from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';

export default function ItemsTab() {
  const { isSuperAdmin } = useAuth();
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', pricePerKg: '', unit: 'kg' });
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchMaterials(); }, []);

  const fetchMaterials = async () => {
    try {
      const { data } = await api.get('/materials');
      setMaterials(data);
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
        const { data } = await api.put(`/materials/${editId}`, form);
        setMaterials(materials.map((m) => (m._id === editId ? data : m)));
      } else {
        const { data } = await api.post('/materials', form);
        setMaterials([...materials, data].sort((a, b) => a.name.localeCompare(b.name)));
      }
      setForm({ name: '', pricePerKg: '', unit: 'kg' });
      setEditId(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (m) => {
    setEditId(m._id);
    setForm({ name: m.name, pricePerKg: m.pricePerKg, unit: m.unit });
    setError('');
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this material?')) return;
    try {
      await api.delete(`/materials/${id}`);
      setMaterials(materials.filter((m) => m._id !== id));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete');
    }
  };

  const cancelEdit = () => {
    setEditId(null);
    setForm({ name: '', pricePerKg: '', unit: 'kg' });
    setError('');
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20, alignItems: 'start' }}>
      {/* Form */}
      <div className="card">
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
          {editId ? 'Edit Material' : 'Add Material'}
        </h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Material Name</label>
            <input
              type="text"
              placeholder="e.g. Aluminium"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div className="form-group">
              <label>Price per unit</label>
              <input
                type="number"
                placeholder="0.00"
                min="0"
                step="0.01"
                value={form.pricePerKg}
                onChange={(e) => setForm({ ...form, pricePerKg: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Unit</label>
              <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                <option value="kg">kg</option>
                <option value="ton">ton</option>
                <option value="piece">piece</option>
                <option value="liter">liter</option>
              </select>
            </div>
          </div>
          {error && <p className="error-msg" style={{ marginBottom: 10 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={saving}>
              {saving ? 'Saving...' : editId ? 'Update' : 'Add Material'}
            </button>
            {editId && (
              <button type="button" className="btn-ghost" onClick={cancelEdit}>Cancel</button>
            )}
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Materials</h2>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{materials.length} items</span>
        </div>
        {loading ? (
          <div className="empty-state">Loading...</div>
        ) : materials.length === 0 ? (
          <div className="empty-state">No materials yet. Add one!</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Price / Unit</th>
                <th>Unit</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {materials.map((m) => (
                <tr key={m._id}>
                  <td style={{ fontWeight: 500 }}>{m.name}</td>
                  <td style={{ color: 'var(--primary-dark)', fontWeight: 600 }}>
                    {Number(m.pricePerKg).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td>{m.unit}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn-ghost btn-sm" onClick={() => handleEdit(m)}>Edit</button>
                      {isSuperAdmin && (
                        <button className="btn-danger btn-sm" onClick={() => handleDelete(m._id)}>Delete</button>
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
