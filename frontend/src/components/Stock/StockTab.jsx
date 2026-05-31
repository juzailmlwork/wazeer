import { useState, useEffect, useMemo, useRef } from 'react';
import api from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const fmt = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function StockTab() {
  const { isSuperAdmin } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [transactions, setTransactions] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);

  // { [materialName]: value } for the selected month and previous month
  const [closingStocks, setClosingStocks] = useState({});
  const [prevClosingStocks, setPrevClosingStocks] = useState({});
  const [lastUpdated, setLastUpdated] = useState(null);

  // Inline edit state
  const [editing, setEditing] = useState(null); // { name, value }
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    Promise.all([api.get('/transactions'), api.get('/sales')])
      .then(([txRes, saleRes]) => {
        setTransactions(txRes.data);
        setSales(saleRes.data);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    Promise.all([
      api.get('/closing-stock', { params: { month, year } }),
      api.get('/closing-stock', { params: { month: prevMonth, year: prevYear } }),
    ]).then(([currRes, prevRes]) => {
      const curr = {};
      let latest = null;
      currRes.data.forEach((r) => {
        curr[r.materialName] = r.value;
        const t = new Date(r.updatedAt);
        if (!latest || t > latest) latest = t;
      });
      setClosingStocks(curr);
      setLastUpdated(latest);
      const prev = {};
      prevRes.data.forEach((r) => { prev[r.materialName] = r.value; });
      setPrevClosingStocks(prev);
    });
  }, [month, year]);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const stockData = useMemo(() => {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 1);

    const prevPurchases = {};
    const thisPurchases = {};
    const prevSales = {};
    const thisSales = {};

    for (const tx of transactions) {
      const d = new Date(tx.createdAt);
      const bucket = d < monthStart ? prevPurchases : d < monthEnd ? thisPurchases : null;
      if (!bucket) continue;
      for (const item of tx.items) {
        if (!item.materialName) continue;
        bucket[item.materialName] = (bucket[item.materialName] || 0) + (item.weight || 0);
      }
    }

    for (const s of sales) {
      const d = new Date(s.createdAt);
      const bucket = d < monthStart ? prevSales : d < monthEnd ? thisSales : null;
      if (!bucket) continue;
      for (const item of s.items) {
        if (!item.materialName) continue;
        bucket[item.materialName] = (bucket[item.materialName] || 0) + (item.weight || 0);
      }
    }

    const allMaterials = new Set([
      ...Object.keys(prevPurchases),
      ...Object.keys(thisPurchases),
      ...Object.keys(prevSales),
      ...Object.keys(thisSales),
      ...Object.keys(closingStocks),
    ]);

    return Array.from(allMaterials).sort().map((name) => {
      // Use previous month's real closing stock as beginning stock if it was set
      const beginningStock = prevClosingStocks[name] !== undefined
        ? prevClosingStocks[name]
        : Math.max(0, (prevPurchases[name] || 0) - (prevSales[name] || 0));

      const monthPurchases = thisPurchases[name] || 0;
      const monthSales = thisSales[name] || 0;
      const remaining = beginningStock + monthPurchases - monthSales;
      const realClosing = closingStocks[name]; // undefined if not set yet

      return { name, beginningStock, monthPurchases, monthSales, remaining, realClosing };
    });
  }, [transactions, sales, month, year, closingStocks, prevClosingStocks]);

  const handleStartEdit = (name, currentValue) => {
    setEditing({ name, value: currentValue !== undefined ? String(currentValue) : '' });
  };

  const handleSaveClosing = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const { data } = await api.post('/closing-stock', {
        materialName: editing.name,
        month,
        year,
        value: Number(editing.value) || 0,
      });
      setClosingStocks((prev) => ({ ...prev, [data.materialName]: data.value }));
      setLastUpdated(new Date(data.updatedAt));
      setEditing(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSaveClosing();
    if (e.key === 'Escape') setEditing(null);
  };

  const yearOptions = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 3; y--) yearOptions.push(y);

  return (
    <div>
      {/* Month/Year selector */}
      <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <span style={{ fontWeight: 600, fontSize: 15 }}>Stock Report</span>
            {lastUpdated ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Last updated: {lastUpdated.toLocaleString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>No closing stock set for this month</div>
            )}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Month:</span>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ width: 130 }}>
              {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 90 }}>
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>{MONTH_NAMES[month]} {year}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isSuperAdmin && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Click "Real Closing Stock" cell to set</span>
            )}
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{stockData.length} items</span>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">Loading...</div>
        ) : stockData.length === 0 ? (
          <div className="empty-state">No stock data for this period.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th style={{ textAlign: 'right' }}>Beginning Stock (kg)</th>
                <th style={{ textAlign: 'right' }}>Purchases (kg)</th>
                <th style={{ textAlign: 'right' }}>Sales (kg)</th>
                <th style={{ textAlign: 'right' }}>Calculated Closing (kg)</th>
                <th style={{ textAlign: 'right' }}>Real Closing Stock (kg)</th>
                <th style={{ textAlign: 'right' }}>Difference (kg)</th>
              </tr>
            </thead>
            <tbody>
              {stockData.map((row) => (
                <tr key={row.name}>
                  <td style={{ fontWeight: 500 }}>{row.name}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{fmt(row.beginningStock)}</td>
                  <td style={{ textAlign: 'right', color: '#15803d', fontWeight: 500 }}>{fmt(row.monthPurchases)}</td>
                  <td style={{ textAlign: 'right', color: '#dc2626', fontWeight: 500 }}>{fmt(row.monthSales)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: row.remaining >= 0 ? 'var(--primary-dark)' : '#dc2626' }}>
                    {fmt(row.remaining)}
                  </td>
                  <td style={{ textAlign: 'right', padding: '8px 16px' }}>
                    {isSuperAdmin ? (
                      editing?.name === row.name ? (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                          <input
                            ref={inputRef}
                            type="number"
                            min="0"
                            step="0.01"
                            value={editing.value}
                            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                            onKeyDown={handleKeyDown}
                            onBlur={handleSaveClosing}
                            style={{ width: 110, marginBottom: 0, textAlign: 'right' }}
                            disabled={saving}
                          />
                        </div>
                      ) : (
                        <div
                          onClick={() => handleStartEdit(row.name, row.realClosing)}
                          style={{
                            cursor: 'pointer',
                            fontWeight: 700,
                            color: row.realClosing !== undefined ? '#0891b2' : 'var(--text-muted)',
                            borderBottom: '1px dashed var(--border)',
                            display: 'inline-block',
                            minWidth: 60,
                          }}
                        >
                          {row.realClosing !== undefined ? fmt(row.realClosing) : '—'}
                        </div>
                      )
                    ) : (
                      <span style={{ fontWeight: 700, color: row.realClosing !== undefined ? '#0891b2' : 'var(--text-muted)' }}>
                        {row.realClosing !== undefined ? fmt(row.realClosing) : '—'}
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, padding: '8px 16px' }}>
                    {row.realClosing !== undefined ? (() => {
                      const diff = row.realClosing - row.remaining;
                      return (
                        <span style={{ color: diff === 0 ? 'var(--text-muted)' : diff > 0 ? '#15803d' : '#dc2626' }}>
                          {diff > 0 ? '+' : ''}{fmt(diff)}
                        </span>
                      );
                    })() : (
                      <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f8fafc' }}>
                <td style={{ fontWeight: 600, padding: '10px 16px' }}>Total</td>
                <td style={{ textAlign: 'right', fontWeight: 700, padding: '10px 16px', color: 'var(--text-muted)' }}>
                  {fmt(stockData.reduce((s, r) => s + r.beginningStock, 0))}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700, padding: '10px 16px', color: '#15803d' }}>
                  {fmt(stockData.reduce((s, r) => s + r.monthPurchases, 0))}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700, padding: '10px 16px', color: '#dc2626' }}>
                  {fmt(stockData.reduce((s, r) => s + r.monthSales, 0))}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700, padding: '10px 16px', color: 'var(--primary-dark)' }}>
                  {fmt(stockData.reduce((s, r) => s + r.remaining, 0))}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700, padding: '10px 16px', color: '#0891b2' }}>
                  {stockData.some((r) => r.realClosing !== undefined)
                    ? fmt(stockData.reduce((s, r) => s + (r.realClosing ?? 0), 0))
                    : '—'}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700, padding: '10px 16px' }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>—</span>
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
