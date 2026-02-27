import { useState, useEffect, useMemo } from 'react';
import React from 'react';
import api from '../../api/index.js';
import { exportPurchasesPDF } from '../../utils/pdf.js';

const today = () => new Date().toISOString().slice(0, 10);

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
  { id: 'today', label: 'Today' },
  { id: 'month', label: 'This Month' },
  { id: 'custom', label: 'Custom' },
];

export default function PurchasesTab() {
  const [transactions, setTransactions] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterMaterial, setFilterMaterial] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [period, setPeriod] = useState('today');
  const [customFrom, setCustomFrom] = useState(today());
  const [customTo, setCustomTo] = useState(today());
  const [expanded, setExpanded] = useState({});

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [txRes, matRes, supRes] = await Promise.all([
        api.get('/transactions'),
        api.get('/materials'),
        api.get('/suppliers'),
      ]);
      setTransactions(txRes.data);
      setMaterials(matRes.data);
      setSuppliers(supRes.data);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const filtered = useMemo(() => {
    const todayStr = today();
    const dateFiltered = transactions.filter((tx) => {
      if (period === 'all') return true;
      const txDate = new Date(tx.createdAt).toISOString().slice(0, 10);
      if (period === 'today') return txDate === todayStr;
      if (period === 'month') { const { from, to } = thisMonthRange(); return inRange(txDate, from, to); }
      if (period === 'custom') return inRange(txDate, customFrom, customTo);
      return true;
    });
    const supplierFiltered = filterSupplier
      ? dateFiltered.filter((tx) => tx.supplier?._id === filterSupplier)
      : dateFiltered;
    return filterMaterial
      ? supplierFiltered.filter((tx) => tx.items.some((item) => item.material === filterMaterial))
      : supplierFiltered;
  }, [transactions, period, customFrom, customTo, filterSupplier, filterMaterial]);

  const selectedMaterial = useMemo(
    () => materials.find((m) => m._id === filterMaterial),
    [materials, filterMaterial]
  );
  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s._id === filterSupplier),
    [suppliers, filterSupplier]
  );

  const { totalValue, totalWeight } = useMemo(() => {
    if (filterMaterial) {
      let value = 0, weight = 0;
      filtered.forEach((tx) => {
        const match = tx.items.find((item) => item.material === filterMaterial);
        if (match) { value += match.totalPrice; weight += match.weight; }
      });
      return { totalValue: value, totalWeight: weight };
    }
    return {
      totalValue: filtered.reduce((sum, tx) => sum + tx.grandTotal, 0),
      totalWeight: null,
    };
  }, [filtered, filterMaterial]);

  const hasFilters = filterMaterial || filterSupplier;

  return (
    <div>
      {/* Filters bar */}
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

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <select value={filterSupplier} onChange={(e) => setFilterSupplier(e.target.value)} style={{ width: 180 }}>
              <option value="">All Suppliers</option>
              {suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>

            <select value={filterMaterial} onChange={(e) => setFilterMaterial(e.target.value)} style={{ width: 180 }}>
              <option value="">All Items</option>
              {materials.map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
            </select>

            {hasFilters && (
              <button className="btn-ghost btn-sm" onClick={() => { setFilterMaterial(''); setFilterSupplier(''); }}>
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard label="Transactions" value={filtered.length} color="var(--primary-dark)" />
        <StatCard
          label={filterMaterial ? `Total — ${selectedMaterial?.name}` : filterSupplier ? `Total — ${selectedSupplier?.name}` : 'Total Value'}
          value={totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          color="var(--primary-dark)"
        />
        {filterMaterial && totalWeight !== null && (
          <StatCard
            label={`Weight — ${selectedMaterial?.name}`}
            value={`${totalWeight.toLocaleString('en-US', { minimumFractionDigits: 2 })} kg`}
            color="var(--warning)"
          />
        )}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>
            Purchases
            {filterSupplier && <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 400, marginLeft: 8 }}>· {selectedSupplier?.name}</span>}
            {filterMaterial && <span style={{ color: 'var(--primary)', fontSize: 13, fontWeight: 400, marginLeft: 8 }}>· {selectedMaterial?.name}</span>}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{filtered.length} records</span>
            {filtered.length > 0 && (
              <button
                className="btn-ghost btn-sm"
                onClick={() => exportPurchasesPDF({ filtered, filterMaterial, selectedMaterial, filterSupplier, selectedSupplier, period, totalValue, totalWeight })}
              >
                ↓ PDF
              </button>
            )}
          </div>
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
                <th style={{ textAlign: 'right' }}>{filterMaterial ? `${selectedMaterial?.name} Amount` : 'Total'}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tx) => {
                const matchedItem = filterMaterial
                  ? tx.items.find((item) => item.material === filterMaterial)
                  : null;
                const displayTotal = matchedItem ? matchedItem.totalPrice : tx.grandTotal;

                return (
                  <React.Fragment key={tx._id}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => toggleExpand(tx._id)}>
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
                          {tx.items.map((item) => (
                            <span
                              key={item.material || item.materialName}
                              className="badge"
                              style={{
                                background: filterMaterial && item.material === filterMaterial ? 'var(--primary-light)' : '#f1f5f9',
                                color: filterMaterial && item.material === filterMaterial ? 'var(--primary-dark)' : 'var(--text)',
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
                        {Number(displayTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        {matchedItem && (
                          <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>
                            {matchedItem.weight} kg · Grand: {Number(tx.grandTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </div>
                        )}
                      </td>
                    </tr>

                    {expanded[tx._id] && (
                      <tr>
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
                                {tx.items.map((item) => (
                                  <tr
                                    key={item.material || item.materialName}
                                    style={{ background: filterMaterial && item.material === filterMaterial ? '#f0fdf4' : 'transparent' }}
                                  >
                                    <td style={{ padding: '6px 8px', fontWeight: 500, borderBottom: 'none' }}>{item.materialName}</td>
                                    <td style={{ padding: '6px 8px', color: 'var(--text-muted)', borderBottom: 'none' }}>{item.weight} kg</td>
                                    <td style={{ padding: '6px 8px', color: 'var(--text-muted)', borderBottom: 'none' }}>
                                      {Number(item.pricePerKg).toLocaleString('en-US', { minimumFractionDigits: 2 })} / kg
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
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
    </div>
  );
}
