import { useState, useEffect, useRef, memo } from 'react';
import api from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';

export default function ItemsTab() {
  const { isSuperAdmin } = useAuth();
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', buyingPrice: '', sellingPrice: '', unit: 'kg' });
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // { id, field } — which cell is being inline-edited
  const [inlineEdit, setInlineEdit] = useState(null);
  const [inlineValue, setInlineValue] = useState('');
  const inlineRef = useRef(null);

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
      setForm({ name: '', buyingPrice: '', sellingPrice: '', unit: 'kg' });
      setEditId(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (m) => {
    setEditId(m._id);
    setForm({ name: m.name, buyingPrice: m.buyingPrice, sellingPrice: m.sellingPrice, unit: m.unit });
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
    setForm({ name: '', buyingPrice: '', sellingPrice: '', unit: 'kg' });
    setError('');
  };

  const startInline = (m, field) => {
    setInlineEdit({ id: m._id, field });
    setInlineValue(String(m[field]));
    setTimeout(() => inlineRef.current?.select(), 0);
  };

  const commitInline = async (m) => {
    if (!inlineEdit) return;
    const val = parseFloat(inlineValue);
    if (isNaN(val) || val < 0) { setInlineEdit(null); return; }
    // optimistic update
    setMaterials((prev) => prev.map((mat) => mat._id === m._id ? { ...mat, [inlineEdit.field]: val } : mat));
    setInlineEdit(null);
    try {
      const { data } = await api.put(`/materials/${m._id}`, { ...m, [inlineEdit.field]: val });
      setMaterials((prev) => prev.map((mat) => mat._id === m._id ? data : mat));
    } catch {
      // revert on failure
      setMaterials((prev) => prev.map((mat) => mat._id === m._id ? m : mat));
    }
  };

  const handleInlineKey = (e, m) => {
    if (e.key === 'Enter') commitInline(m);
    if (e.key === 'Escape') setInlineEdit(null);
    if (e.key === 'Tab') {
      e.preventDefault();
      const field = inlineEdit.field;
      const nextField = field === 'buyingPrice' ? 'sellingPrice' : 'buyingPrice';
      commitInline(m).then?.();
      setTimeout(() => startInline(m, nextField), 50);
    }
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
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Buying Price / kg</label>
            <input
              type="number"
              placeholder="0.00"
              min="0"
              step="0.01"
              value={form.buyingPrice}
              onChange={(e) => setForm({ ...form, buyingPrice: e.target.value })}
              required
            />
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Selling Price / kg</label>
            <input
              type="number"
              placeholder="0.00"
              min="0"
              step="0.01"
              value={form.sellingPrice}
              onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
              required
            />
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
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{materials.length} items · click a price to edit</span>
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
                <th>Buying Price / kg</th>
                <th>Selling Price / kg</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {materials.map((m) => (
                <tr key={m._id}>
                  <td style={{ fontWeight: 500 }}>{m.name}</td>
                  <PriceCell m={m} field="buyingPrice" color="#b45309" inlineEdit={inlineEdit} inlineValue={inlineValue} inlineRef={inlineRef} setInlineValue={setInlineValue} onCommit={commitInline} onKey={handleInlineKey} onStart={startInline} />
                  <PriceCell m={m} field="sellingPrice" color="var(--primary-dark)" inlineEdit={inlineEdit} inlineValue={inlineValue} inlineRef={inlineRef} setInlineValue={setInlineValue} onCommit={commitInline} onKey={handleInlineKey} onStart={startInline} />
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

function PriceCell({ m, field, color, inlineEdit, inlineValue, inlineRef, setInlineValue, onCommit, onKey, onStart }) {
  const active = inlineEdit?.id === m._id && inlineEdit?.field === field;
  if (active) {
    return (
      <td>
        <input
          ref={inlineRef}
          type="number"
          min="0"
          step="0.01"
          value={inlineValue}
          onChange={(e) => setInlineValue(e.target.value)}
          onBlur={() => onCommit(m)}
          onKeyDown={(e) => onKey(e, m)}
          style={{ width: 100, fontWeight: 600, color, padding: '4px 8px', fontSize: 13 }}
        />
      </td>
    );
  }
  return (
    <td
      onClick={() => onStart(m, field)}
      title="Click to edit"
      style={{ color, fontWeight: 600, cursor: 'text', borderBottom: '1px dashed ' + color, userSelect: 'none' }}
    >
      {Number(m[field]).toLocaleString('en-US', { minimumFractionDigits: 2 })}
    </td>
  );
}
