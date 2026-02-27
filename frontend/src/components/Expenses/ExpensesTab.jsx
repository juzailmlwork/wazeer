import { useState, useEffect, useRef } from 'react';
import api from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';

const TAG_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function ExpensesTab() {
  const { isSuperAdmin } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ description: '', amount: '' });
  const [selectedTags, setSelectedTags] = useState([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showTagForm, setShowTagForm] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [expRes, tagRes] = await Promise.all([api.get('/expenses'), api.get('/tags')]);
      setExpenses(expRes.data);
      setTags(tagRes.data);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const { data } = await api.post('/tags', { name: newTagName.trim(), color: newTagColor });
      setTags([...tags, data].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedTags([...selectedTags, data._id]);
      setNewTagName('');
      setShowTagForm(false);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create tag');
    }
  };

  const toggleTag = (tagId) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const { data } = await api.post('/expenses', {
        description: form.description,
        amount: Number(form.amount),
        tags: selectedTags,
      });
      setExpenses([data, ...expenses]);
      setForm({ description: '', amount: '' });
      setSelectedTags([]);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this expense?')) return;
    try {
      await api.delete(`/expenses/${id}`);
      setExpenses(expenses.filter((e) => e._id !== id));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete');
    }
  };

  const handleDeleteTag = async (id) => {
    if (!confirm('Delete this tag?')) return;
    try {
      await api.delete(`/tags/${id}`);
      setTags(tags.filter((t) => t._id !== id));
      setSelectedTags(selectedTags.filter((tid) => tid !== id));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete tag');
    }
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20, alignItems: 'start' }}>
      {/* Form */}
      <div className="card">
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Add Expense</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Description <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
            <textarea
              placeholder="What was this expense for?"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              style={{ resize: 'vertical' }}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Amount</label>
            <input
              type="number"
              placeholder="0.00"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
          </div>

          {/* Tags */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ marginBottom: 8 }}>Tags</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {tags.map((tag) => (
                <button
                  key={tag._id}
                  type="button"
                  onClick={() => toggleTag(tag._id)}
                  style={{
                    padding: '3px 10px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 500,
                    background: selectedTags.includes(tag._id) ? tag.color : '#f1f5f9',
                    color: selectedTags.includes(tag._id) ? 'white' : 'var(--text)',
                    border: `1.5px solid ${selectedTags.includes(tag._id) ? tag.color : 'var(--border)'}`,
                    cursor: 'pointer',
                  }}
                >
                  {tag.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowTagForm(!showTagForm)}
                style={{
                  padding: '3px 10px',
                  borderRadius: 999,
                  fontSize: 12,
                  background: 'transparent',
                  color: 'var(--primary)',
                  border: '1.5px dashed var(--primary)',
                  cursor: 'pointer',
                }}
              >
                + New Tag
              </button>
            </div>

            {showTagForm && (
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginTop: 8 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input
                    type="text"
                    placeholder="Tag name"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    style={{ flex: 1, padding: '6px 10px', fontSize: 13 }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleCreateTag())}
                  />
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  {TAG_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewTagColor(c)}
                      style={{
                        width: 20, height: 20, borderRadius: '50%', background: c, border: 'none',
                        outline: newTagColor === c ? `2px solid ${c}` : 'none',
                        outlineOffset: 2, cursor: 'pointer', padding: 0,
                      }}
                    />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="btn-primary btn-sm" onClick={handleCreateTag}>Create</button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setShowTagForm(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>

          {error && <p className="error-msg" style={{ marginBottom: 10 }}>{error}</p>}
          <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={saving}>
            {saving ? 'Saving...' : 'Add Expense'}
          </button>
        </form>

        {/* Tag management */}
        {isSuperAdmin && tags.length > 0 && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Manage Tags
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {tags.map((tag) => (
                <span key={tag._id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: tag.color + '20', color: tag.color, fontSize: 12, fontWeight: 500 }}>
                  {tag.name}
                  <button
                    type="button"
                    onClick={() => handleDeleteTag(tag._id)}
                    style={{ background: 'none', border: 'none', color: tag.color, cursor: 'pointer', padding: '0 0 0 2px', fontSize: 14, lineHeight: 1 }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div>
        {/* Summary */}
        <div className="card" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>Total Expenses</span>
          <span style={{ fontWeight: 700, fontSize: 20, color: 'var(--danger)' }}>
            {totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>Expenses</h2>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{expenses.length} records</span>
          </div>
          {loading ? (
            <div className="empty-state">Loading...</div>
          ) : expenses.length === 0 ? (
            <div className="empty-state">No expenses yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Tags</th>
                  <th>Amount</th>
                  {isSuperAdmin && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e._id}>
                    <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 13 }}>
                      {new Date(e.createdAt).toLocaleDateString()}
                    </td>
                    <td>{e.description || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {e.tags?.map((tag) => (
                          <span
                            key={tag._id}
                            className="badge"
                            style={{ background: tag.color + '20', color: tag.color }}
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--danger)', whiteSpace: 'nowrap' }}>
                      {Number(e.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    {isSuperAdmin && (
                      <td>
                        <button className="btn-danger btn-sm" onClick={() => handleDelete(e._id)}>Delete</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
