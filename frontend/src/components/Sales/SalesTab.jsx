import { useState, useEffect, useMemo } from 'react';
import React from 'react';
import api from '../../api/index.js';

const pad = (n) => String(n).padStart(2, '0');

const localDate = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};

const today = () => localDate(new Date());

const thisMonthRange = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const lastDay = pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());
  return { from: `${year}-${month}-01`, to: `${year}-${month}-${lastDay}` };
};

function inRange(dateStr, from, to) {
  return dateStr >= from && dateStr <= to;
}

const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'month', label: 'This Month' },
  { id: 'custom', label: 'Custom' },
];

export default function SalesTab() {
  const [sales, setSales] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterMaterial, setFilterMaterial] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [period, setPeriod] = useState('today');
  const [customFrom, setCustomFrom] = useState(today());
  const [customTo, setCustomTo] = useState(today());
  const [expanded, setExpanded] = useState({});

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [saleRes, matRes, custRes] = await Promise.all([
        api.get('/sales'),
        api.get('/materials'),
        api.get('/customers'),
      ]);
      setSales(saleRes.data);
      setMaterials(matRes.data);
      setCustomers(custRes.data);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const filtered = useMemo(() => {
    const todayStr = today();
    const dateFiltered = sales.filter((sale) => {
      const saleDate = localDate(sale.createdAt);
      if (period === 'today') return saleDate === todayStr;
      if (period === 'month') { const { from, to } = thisMonthRange(); return inRange(saleDate, from, to); }
      if (period === 'custom') return inRange(saleDate, customFrom, customTo);
      return true;
    });
    const customerFiltered = filterCustomer
      ? dateFiltered.filter((sale) => sale.customer?._id === filterCustomer)
      : dateFiltered;
    return filterMaterial
      ? customerFiltered.filter((sale) => sale.items.some((item) => item.material === filterMaterial))
      : customerFiltered;
  }, [sales, period, customFrom, customTo, filterCustomer, filterMaterial]);

  const selectedMaterial = useMemo(
    () => materials.find((m) => m._id === filterMaterial),
    [materials, filterMaterial]
  );
  const selectedCustomer = useMemo(
    () => customers.find((c) => c._id === filterCustomer),
    [customers, filterCustomer]
  );

  const { totalValue, totalWeight } = useMemo(() => {
    if (filterMaterial) {
      let value = 0, weight = 0;
      filtered.forEach((sale) => {
        const match = sale.items.find((item) => item.material === filterMaterial);
        if (match) { value += match.totalPrice; weight += match.weight; }
      });
      return { totalValue: value, totalWeight: weight };
    }
    return {
      totalValue: filtered.reduce((sum, sale) => sum + sale.grandTotal, 0),
      totalWeight: null,
    };
  }, [filtered, filterMaterial]);

  const hasFilters = filterMaterial || filterCustomer;

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
            <select value={filterCustomer} onChange={(e) => setFilterCustomer(e.target.value)} style={{ width: 180 }}>
              <option value="">All Customers</option>
              {customers.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>

            <select value={filterMaterial} onChange={(e) => setFilterMaterial(e.target.value)} style={{ width: 180 }}>
              <option value="">All Items</option>
              {materials.map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
            </select>

            {hasFilters && (
              <button className="btn-ghost btn-sm" onClick={() => { setFilterMaterial(''); setFilterCustomer(''); }}>
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard label="Sales" value={filtered.length} color="var(--primary-dark)" />
        <StatCard
          label={filterMaterial ? `Total — ${selectedMaterial?.name}` : filterCustomer ? `Total — ${selectedCustomer?.name}` : 'Total Value'}
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
            Sales
            {filterCustomer && <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 400, marginLeft: 8 }}>· {selectedCustomer?.name}</span>}
            {filterMaterial && <span style={{ color: 'var(--primary)', fontSize: 13, fontWeight: 400, marginLeft: 8 }}>· {selectedMaterial?.name}</span>}
          </h2>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{filtered.length} records</span>
        </div>

        {loading ? (
          <div className="empty-state">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">No sales found.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 32 }} />
                <th>Date</th>
                <th>Items</th>
                <th>Customer</th>
                <th>Created By</th>
                <th style={{ textAlign: 'right' }}>{filterMaterial ? `${selectedMaterial?.name} Amount` : 'Total'}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((sale) => {
                const matchedItem = filterMaterial
                  ? sale.items.find((item) => item.material === filterMaterial)
                  : null;
                const displayTotal = matchedItem ? matchedItem.totalPrice : sale.grandTotal;

                return (
                  <React.Fragment key={sale._id}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => toggleExpand(sale._id)}>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12, paddingLeft: 16 }}>
                        {expanded[sale._id] ? '▼' : '▶'}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: 13 }}>
                        {new Date(sale.createdAt).toLocaleDateString()}{' '}
                        <span style={{ fontSize: 12 }}>
                          {new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {sale.items.map((item) => (
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
                      <td style={{ color: sale.customerName ? 'var(--text)' : 'var(--text-muted)' }}>
                        {sale.customerName || '—'}
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{sale.createdBy || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary-dark)', whiteSpace: 'nowrap' }}>
                        {Number(displayTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        {matchedItem && (
                          <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>
                            {matchedItem.weight} kg · Grand: {Number(sale.grandTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </div>
                        )}
                      </td>
                    </tr>

                    {expanded[sale._id] && (
                      <tr>
                        <td colSpan={6} style={{ padding: 0, background: '#f8fafc' }}>
                          <div style={{ padding: '12px 20px 12px 48px' }}>
                            <table style={{ width: '100%' }}>
                              <thead>
                                <tr>
                                  <th style={{ background: 'transparent', padding: '6px 8px', fontSize: 11 }}>Material</th>
                                  <th style={{ background: 'transparent', padding: '6px 8px', fontSize: 11 }}>Weight</th>
                                  <th style={{ background: 'transparent', padding: '6px 8px', fontSize: 11 }}>Today's Price</th>
                                  <th style={{ background: 'transparent', padding: '6px 8px', fontSize: 11 }}>Avg Price</th>
                                  <th style={{ background: 'transparent', padding: '6px 8px', fontSize: 11, textAlign: 'right' }}>Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sale.items.map((item) => (
                                  <tr
                                    key={item.material || item.materialName}
                                    style={{ background: filterMaterial && item.material === filterMaterial ? '#f0fdf4' : 'transparent' }}
                                  >
                                    <td style={{ padding: '6px 8px', fontWeight: 500, borderBottom: 'none' }}>{item.materialName}</td>
                                    <td style={{ padding: '6px 8px', color: 'var(--text-muted)', borderBottom: 'none' }}>{item.weight} kg</td>
                                    <td style={{ padding: '6px 8px', color: 'var(--text-muted)', borderBottom: 'none' }}>
                                      {Number(item.pricePerKg).toLocaleString('en-US', { minimumFractionDigits: 2 })} / kg
                                    </td>
                                    <td style={{ padding: '6px 8px', color: 'var(--text-muted)', borderBottom: 'none' }}>
                                      {item.weight ? (item.totalPrice / item.weight).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'} / kg
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
