import { useState, useEffect } from 'react';
import api from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';

const TAG_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#06b6d4'];

const todayStr = () => new Date().toISOString().slice(0, 10);

const thisMonthRange = () => {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { from, to };
};

function inRange(dateStr, from, to) {
  const d = dateStr.slice(0, 10);
  return d >= from && d <= to;
}

const PERIODS = [
  { id: 'all', label: 'All' },
  { id: 'today', label: 'Today' },
  { id: 'month', label: 'This Month' },
  { id: 'custom', label: 'Custom' },
];

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
  const [period, setPeriod] = useState('all');
  const [customFrom, setCustomFrom] = useState(todayStr());
  const [customTo, setCustomTo] = useState(todayStr());
  const [filterTag, setFilterTag] = useState('');

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
      if (filterTag === id) setFilterTag('');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete tag');
    }
  };

  // Date filter
  const dateFiltered = expenses.filter((e) => {
    if (period === 'all') return true;
    const d = new Date(e.createdAt).toISOString().slice(0, 10);
    if (period === 'today') return d === todayStr();
    if (period === 'month') {
      const { from, to } = thisMonthRange();
      return inRange(d, from, to);
    }
    if (period === 'custom') return inRange(d, customFrom, customTo);
    return true;
  });

  // Tag filter
  const filtered = filterTag
    ? dateFiltered.filter((e) => e.tags?.some((t) => t._id === filterTag))
    : dateFiltered;

  const totalFiltered = filtered.reduce((sum, e) => sum + e.amount, 0);
  const selectedTagObj = tags.find((t) => t._id === filterTag);

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

            {/* Selected tag chips */}
            {selectedTags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {selectedTags.map((tagId) => {
                  const tag = tags.find((t) => t._id === tagId);
                  if (!tag) return null;
                  return (
                    <span
                      key={tagId}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '3px 8px', borderRadius: 999, fontSize: 12, fontWeight: 500,
                        background: tag.color, color: 'white',
                      }}
                    >
                      {tag.name}
                      <button
                        type="button"
                        onClick={() => toggleTag(tagId)}
                        style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1, opacity: 0.8 }}
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Dropdown */}
            <select
              value=""
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  setShowTagForm(true);
                } else if (e.target.value) {
                  toggleTag(e.target.value);
                }
                e.target.value = '';
              }}
            >
              <option value="">Select a tag...</option>
              {tags.filter((t) => !selectedTags.includes(t._id)).map((t) => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
              <option value="__new__">+ Add new tag</option>
            </select>

            {/* New tag inline form */}
            {showTagForm && (
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginTop: 8 }}>
                <input
                  type="text"
                  placeholder="Tag name"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  style={{ marginBottom: 8 }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleCreateTag())}
                  autoFocus
                />
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
                  <button type="button" className="btn-ghost btn-sm" onClick={() => { setShowTagForm(false); setNewTagName(''); }}>Cancel</button>
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

      {/* Right side */}
      <div>
        {/* Period filter */}
        <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Period:</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {PERIODS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  style={{
                    padding: '5px 14px', borderRadius: 6, fontSize: 13,
                    fontWeight: period === p.id ? 600 : 400,
                    background: period === p.id ? 'var(--primary)' : 'transparent',
                    color: period === p.id ? 'white' : 'var(--text-muted)',
                    border: period === p.id ? 'none' : '1px solid var(--border)',
                    cursor: 'pointer',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {period === 'custom' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ width: 150 }} />
                <span style={{ color: 'var(--text-muted)' }}>to</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ width: 150 }} />
              </div>
            )}

            {/* Tag filter */}
            {tags.length > 0 && (
              <div style={{ marginLeft: 'auto' }}>
                <select
                  value={filterTag}
                  onChange={(e) => setFilterTag(e.target.value)}
                  style={{ width: 180 }}
                >
                  <option value="">All Tags</option>
                  {tags.map((t) => (
                    <option key={t._id} value={t._id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary-dark)' }}>{filtered.length}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Expenses {filterTag && `(${selectedTagObj?.name})`}
            </div>
          </div>
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--danger)' }}>
              {totalFiltered.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Total {filterTag && `(${selectedTagObj?.name})`}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>
              Expenses
              {filterTag && <span style={{ color: selectedTagObj?.color, fontSize: 13, fontWeight: 400, marginLeft: 8 }}>— {selectedTagObj?.name}</span>}
            </h2>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{filtered.length} records</span>
          </div>
          {loading ? (
            <div className="empty-state">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">No expenses found.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Tags</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  {isSuperAdmin && <th />}
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
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
                    <td style={{ fontWeight: 600, color: 'var(--danger)', whiteSpace: 'nowrap', textAlign: 'right' }}>
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
