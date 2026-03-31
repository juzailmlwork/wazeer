import { useState, useEffect, useMemo } from 'react';
import api from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { exportCustomerPDF } from '../../utils/pdf.js';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function CustomersTab() {
  const { isSuperAdmin } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', phone: '' });
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [detailCustomer, setDetailCustomer] = useState(null);

  useEffect(() => { fetchCustomers(); }, []);

  const fetchCustomers = async () => {
    try {
      const { data } = await api.get('/customers');
      setCustomers(data);
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
        const { data } = await api.put(`/customers/${editId}`, form);
        setCustomers(customers.map((c) => (c._id === editId ? data : c)));
      } else {
        const { data } = await api.post('/customers', form);
        setCustomers([...customers, data].sort((a, b) => a.name.localeCompare(b.name)));
      }
      setForm({ name: '', phone: '' });
      setEditId(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (c) => {
    setEditId(c._id);
    setForm({ name: c.name, phone: c.phone });
    setError('');
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this customer?')) return;
    try {
      await api.delete(`/customers/${id}`);
      setCustomers(customers.filter((c) => c._id !== id));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete');
    }
  };

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>
        {/* Form */}
        <div className="card">
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
            {editId ? 'Edit Customer' : 'Add Customer'}
          </h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Name</label>
              <input
                type="text"
                placeholder="Customer name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Phone</label>
              <input
                type="tel"
                placeholder="+1 234 567 8900"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                required
              />
            </div>
            {error && <p className="error-msg" style={{ marginBottom: 10 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={saving}>
                {saving ? 'Saving...' : editId ? 'Update' : 'Add Customer'}
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
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>Customers</h2>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{customers.length} customers</span>
          </div>
          {loading ? (
            <div className="empty-state">Loading...</div>
          ) : customers.length === 0 ? (
            <div className="empty-state">No customers yet. Add one!</div>
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
                {customers.map((c) => (
                  <tr key={c._id}>
                    <td style={{ fontWeight: 500 }}>{c.name}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{c.phone}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn-ghost btn-sm" onClick={() => setDetailCustomer(c)}>Details</button>
                        <button className="btn-ghost btn-sm" onClick={() => handleEdit(c)}>Edit</button>
                        {isSuperAdmin && (
                          <button className="btn-danger btn-sm" onClick={() => handleDelete(c._id)}>Delete</button>
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

      {detailCustomer && (
        <CustomerDetailModal
          customer={detailCustomer}
          onClose={() => setDetailCustomer(null)}
        />
      )}
    </>
  );
}

function CustomerDetailModal({ customer, onClose }) {
  const now = new Date();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());

  useEffect(() => {
    api.get(`/sales?customer=${customer._id}`)
      .then(({ data }) => setSales(data))
      .finally(() => setLoading(false));
  }, [customer._id]);

  const monthsWithData = useMemo(() => (
    [...new Set(
      sales.map((s) => {
        const d = new Date(s.createdAt);
        return `${d.getFullYear()}-${d.getMonth()}`;
      })
    )].map((key) => {
      const [y, m] = key.split('-');
      return { year: Number(y), month: Number(m) };
    }).sort((a, b) => b.year - a.year || b.month - a.month)
  ), [sales]);

  const years = useMemo(
    () => [...new Set(monthsWithData.map((m) => m.year))],
    [monthsWithData]
  );

  const monthSales = useMemo(
    () => sales.filter((s) => {
      const d = new Date(s.createdAt);
      return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth;
    }),
    [sales, selectedYear, selectedMonth]
  );

  const { itemRows, monthGrandTotal, monthGrandWeight } = useMemo(() => {
    const itemMap = {};
    monthSales.forEach((s) => {
      s.items.forEach((item) => {
        const key = item.materialName;
        if (!itemMap[key]) itemMap[key] = { name: key, totalWeight: 0, totalAmount: 0, count: 0 };
        itemMap[key].totalWeight += item.weight || 0;
        itemMap[key].totalAmount += item.totalPrice || 0;
        itemMap[key].count += 1;
      });
    });
    const rows = Object.values(itemMap).sort((a, b) => b.totalAmount - a.totalAmount);
    return {
      itemRows: rows,
      monthGrandTotal: rows.reduce((sum, r) => sum + r.totalAmount, 0),
      monthGrandWeight: rows.reduce((sum, r) => sum + r.totalWeight, 0),
    };
  }, [monthSales]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'white', borderRadius: 12, width: '100%', maxWidth: 680,
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>{customer.name}</h2>
            {customer.phone && <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>{customer.phone}</p>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {monthSales.length > 0 && (
              <button
                className="btn-ghost btn-sm"
                onClick={() => exportCustomerPDF({ customer, itemRows, monthGrandTotal, monthGrandWeight, monthSales, selectedMonth, selectedYear })}
              >
                ↓ PDF
              </button>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)', padding: '0 4px' }}>×</button>
          </div>
        </div>

        {/* Month picker */}
        <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--text-muted)' }}>Month:</span>

          {years.length > 1 && (
            <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} style={{ width: 100 }}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          )}

          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {MONTH_NAMES.map((name, idx) => {
              const hasData = monthsWithData.some((m) => m.year === selectedYear && m.month === idx);
              const isSelected = selectedMonth === idx;
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedMonth(idx)}
                  style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 12,
                    fontWeight: isSelected ? 600 : 400,
                    background: isSelected ? 'var(--primary)' : hasData ? 'var(--primary-light)' : 'transparent',
                    color: isSelected ? 'white' : hasData ? 'var(--primary-dark)' : 'var(--text-muted)',
                    border: isSelected ? 'none' : `1px solid ${hasData ? 'var(--primary-light)' : 'var(--border)'}`,
                    cursor: 'pointer',
                    opacity: hasData || isSelected ? 1 : 0.4,
                  }}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          {loading ? (
            <div className="empty-state">Loading...</div>
          ) : monthSales.length === 0 ? (
            <div className="empty-state">
              No sales to {customer.name} in {MONTH_NAMES[selectedMonth]} {selectedYear}.
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 16px' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary-dark)' }}>{monthSales.length}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Sales</div>
                </div>
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 16px' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary-dark)' }}>
                    {monthGrandWeight.toLocaleString('en-US', { minimumFractionDigits: 2 })} kg
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Total Weight</div>
                </div>
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 16px' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary-dark)' }}>
                    {monthGrandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Total Received</div>
                </div>
              </div>

              <h3 style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Breakdown by Item — {MONTH_NAMES[selectedMonth]} {selectedYear}
              </h3>
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th style={{ textAlign: 'right' }}>Sales</th>
                    <th style={{ textAlign: 'right' }}>Total Weight</th>
                    <th style={{ textAlign: 'right' }}>Total Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {itemRows.map((row) => (
                    <tr key={row.name}>
                      <td style={{ fontWeight: 500 }}>{row.name}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{row.count}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                        {row.totalWeight.toLocaleString('en-US', { minimumFractionDigits: 2 })} kg
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary-dark)' }}>
                        {row.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border)' }}>
                    <td style={{ fontWeight: 700, paddingTop: 8 }}>Total</td>
                    <td />
                    <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 8 }}>
                      {monthGrandWeight.toLocaleString('en-US', { minimumFractionDigits: 2 })} kg
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary-dark)', paddingTop: 8 }}>
                      {monthGrandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
