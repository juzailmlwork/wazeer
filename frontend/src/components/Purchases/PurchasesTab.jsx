import { useState, useEffect } from 'react';
import api from '../../api/index.js';

export default function PurchasesTab() {
  const [transactions, setTransactions] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterMaterial, setFilterMaterial] = useState('');
  const [expanded, setExpanded] = useState({});

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [txRes, matRes] = await Promise.all([
        api.get('/transactions'),
        api.get('/materials'),
      ]);
      setTransactions(txRes.data);
      setMaterials(matRes.data);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const filtered = filterMaterial
    ? transactions.filter((tx) =>
        tx.items.some((item) => item.material === filterMaterial || item.materialName === filterMaterial)
      )
    : transactions;

  const totalValue = filtered.reduce((sum, tx) => sum + tx.grandTotal, 0);

  return (
    <div>
      {/* Filters + Summary */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '0 0 260px' }}>
          <label style={{ display: 'block', fontWeight: 500, fontSize: 13, marginBottom: 4 }}>
            Filter by Item
          </label>
          <select
            value={filterMaterial}
            onChange={(e) => setFilterMaterial(e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="">All Items</option>
            {materials.map((m) => (
              <option key={m._id} value={m._id}>{m.name}</option>
            ))}
          </select>
        </div>

        {filterMaterial && (
          <button
            className="btn-ghost btn-sm"
            onClick={() => setFilterMaterial('')}
            style={{ marginBottom: 1 }}
          >
            Clear filter
          </button>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
          <div className="card" style={{ padding: '10px 20px', display: 'flex', gap: 24 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary-dark)' }}>{filtered.length}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Transactions</div>
            </div>
            <div style={{ width: 1, background: 'var(--border)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary-dark)' }}>
                {totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total Value</div>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>
            Purchases {filterMaterial && <span style={{ color: 'var(--primary)', fontSize: 13 }}>— filtered</span>}
          </h2>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{filtered.length} records</span>
        </div>

        {loading ? (
          <div className="empty-state">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">No purchases found.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 32 }} />
                <th>Date</th>
                <th>Items</th>
                <th>Supplier</th>
                <th>Created By</th>
                <th style={{ textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tx) => (
                <>
                  <tr
                    key={tx._id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => toggleExpand(tx._id)}
                  >
                    <td style={{ color: 'var(--text-muted)', fontSize: 12, paddingLeft: 16 }}>
                      {expanded[tx._id] ? '▼' : '▶'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: 13 }}>
                      {new Date(tx.createdAt).toLocaleDateString()}{' '}
                      <span style={{ fontSize: 12 }}>
                        {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {tx.items.map((item, i) => (
                          <span
                            key={i}
                            className="badge"
                            style={{
                              background: filterMaterial && (item.material === filterMaterial || item.materialName === materials.find(m => m._id === filterMaterial)?.name)
                                ? 'var(--primary-light)'
                                : '#f1f5f9',
                              color: filterMaterial && (item.material === filterMaterial || item.materialName === materials.find(m => m._id === filterMaterial)?.name)
                                ? 'var(--primary-dark)'
                                : 'var(--text)',
                            }}
                          >
                            {item.materialName}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ color: tx.supplierName ? 'var(--text)' : 'var(--text-muted)' }}>
                      {tx.supplierName || '—'}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{tx.createdBy || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary-dark)', whiteSpace: 'nowrap' }}>
                      {Number(tx.grandTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {expanded[tx._id] && (
                    <tr key={tx._id + '-exp'}>
                      <td colSpan={6} style={{ padding: 0, background: '#f8fafc' }}>
                        <div style={{ padding: '12px 20px 12px 48px' }}>
                          <table style={{ width: '100%' }}>
                            <thead>
                              <tr>
                                <th style={{ background: 'transparent', padding: '6px 8px', fontSize: 11 }}>Material</th>
                                <th style={{ background: 'transparent', padding: '6px 8px', fontSize: 11 }}>Weight</th>
                                <th style={{ background: 'transparent', padding: '6px 8px', fontSize: 11 }}>Rate</th>
                                <th style={{ background: 'transparent', padding: '6px 8px', fontSize: 11, textAlign: 'right' }}>Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tx.items.map((item, i) => (
                                <tr key={i}>
                                  <td style={{ padding: '6px 8px', fontWeight: 500, borderBottom: 'none' }}>{item.materialName}</td>
                                  <td style={{ padding: '6px 8px', color: 'var(--text-muted)', borderBottom: 'none' }}>
                                    {item.weight} {item.unit || 'kg'}
                                  </td>
                                  <td style={{ padding: '6px 8px', color: 'var(--text-muted)', borderBottom: 'none' }}>
                                    {Number(item.pricePerKg).toLocaleString('en-US', { minimumFractionDigits: 2 })} / {item.unit || 'kg'}
                                  </td>
                                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--primary-dark)', borderBottom: 'none' }}>
                                    {Number(item.totalPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
