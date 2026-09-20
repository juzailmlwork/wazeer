import { useState, useEffect, useMemo, useRef } from 'react';
import api from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { exportStockMovementPDF } from '../../utils/pdf.js';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const fmt = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};
const monthRange = (month, year) => ({
  from: `${year}-${pad(month + 1)}-01`,
  to: `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`,
});
const YARDS = [
  { id: '', label: 'All Yards' },
  { id: 'hospital', label: 'Hospital' },
  { id: 'nayawala', label: 'Nayawala' },
];
// Records from before yards existed count as hospital, as in the other tabs.
const inYard = (r, yard) => !yard || (r.yard || 'hospital') === yard;

export default function StockTab() {
  const { isSuperAdmin } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [transactions, setTransactions] = useState([]);
  const [sales, setSales] = useState([]);
  const [materials, setMaterials] = useState([]);
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
    Promise.all([api.get('/transactions'), api.get('/sales'), api.get('/materials')])
      .then(([txRes, saleRes, matRes]) => {
        setTransactions(txRes.data);
        setSales(saleRes.data);
        setMaterials(matRes.data);
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
      // Every known item, so a month with no movement (e.g. before you started using the
      // system) still lists rows you can set a closing stock on.
      ...materials.map((m) => m.name).filter(Boolean),
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

      const untouched = !beginningStock && !monthPurchases && !monthSales && realClosing === undefined;
      return { name, beginningStock, monthPurchases, monthSales, remaining, realClosing, untouched };
    });
  }, [transactions, sales, materials, month, year, closingStocks, prevClosingStocks]);

  const yearOptions = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 3; y--) yearOptions.push(y);

  // ---- Purchases & sales report ----
  const [reportMode, setReportMode] = useState('month'); // 'month' | 'range'
  const [reportMonth, setReportMonth] = useState(now.getMonth());
  const [reportYear, setReportYear] = useState(now.getFullYear());
  const [rangeFrom, setRangeFrom] = useState(monthRange(now.getMonth(), now.getFullYear()).from);
  const [rangeTo, setRangeTo] = useState(localDate(now));
  const [reportYard, setReportYard] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const period = useMemo(() => {
    if (reportMode === 'month') {
      const { from, to } = monthRange(reportMonth, reportYear);
      return { from, to, label: `${MONTH_NAMES[reportMonth]} ${reportYear}` };
    }
    return { from: rangeFrom, to: rangeTo, label: `${rangeFrom} to ${rangeTo}` };
  }, [reportMode, reportMonth, reportYear, rangeFrom, rangeTo]);

  const report = useMemo(() => {
    const items = {};
    // Start from the full item list so items with no movement still get a row.
    const blank = (name) => ({ name, purchaseWeight: 0, purchaseValue: 0, saleWeight: 0, saleValue: 0 });
    materials.forEach((m) => { if (m.name) items[m.name] = blank(m.name); });
    const add = (name, kind, weight, value) => {
      if (!name) return;
      // Items deleted or renamed since still appear, so their history isn't hidden.
      items[name] ||= blank(name);
      items[name][`${kind}Weight`] += weight || 0;
      items[name][`${kind}Value`] += value || 0;
    };
    const within = (r) => {
      const d = localDate(r.createdAt);
      return d >= period.from && d <= period.to && inYard(r, reportYard);
    };
    transactions.filter(within).forEach((tx) => tx.items.forEach((i) => add(i.materialName, 'purchase', i.weight, i.totalPrice)));
    sales.filter(within).forEach((sale) => sale.items.forEach((i) => add(i.materialName, 'sale', i.weight, i.totalPrice)));

    const rows = Object.values(items)
      .map((r) => ({ ...r, active: r.purchaseWeight > 0 || r.saleWeight > 0 || r.purchaseValue > 0 || r.saleValue > 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const totals = rows.reduce((t, r) => {
      for (const k of ['purchaseWeight', 'purchaseValue', 'saleWeight', 'saleValue']) t[k] += r[k];
      return t;
    }, { purchaseWeight: 0, purchaseValue: 0, saleWeight: 0, saleValue: 0 });
    return { rows, totals, activeCount: rows.filter((r) => r.active).length };
  }, [transactions, sales, materials, period, reportYard]);

  const rangeValid = reportMode === 'month' || (rangeFrom && rangeTo && rangeFrom <= rangeTo);

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

      {/* Purchases & sales report — collapsed until asked for */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Purchases &amp; Sales Report</span>
          <button
            className="btn-ghost btn-sm"
            style={{ marginLeft: 'auto' }}
            onClick={() => { setReportOpen((o) => !o); setShowPreview(false); }}
          >
            {reportOpen ? 'Close' : '↓ Download PDF'}
          </button>
        </div>

        {reportOpen && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {[{ id: 'month', label: 'Month' }, { id: 'range', label: 'Date Range' }].map((m) => (
              <button
                key={m.id}
                onClick={() => setReportMode(m.id)}
                style={{
                  padding: '5px 14px', borderRadius: 6, fontSize: 13,
                  fontWeight: reportMode === m.id ? 600 : 400,
                  background: reportMode === m.id ? 'var(--primary)' : 'transparent',
                  color: reportMode === m.id ? 'white' : 'var(--text-muted)',
                  border: reportMode === m.id ? 'none' : '1px solid var(--border)',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {reportMode === 'month' ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={reportMonth} onChange={(e) => setReportMonth(Number(e.target.value))} style={{ width: 130 }}>
                {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select value={reportYear} onChange={(e) => setReportYear(Number(e.target.value))} style={{ width: 90 }}>
                {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="date" value={rangeFrom} max={rangeTo} onChange={(e) => setRangeFrom(e.target.value)} style={{ width: 150 }} />
              <span style={{ color: 'var(--text-muted)' }}>to</span>
              <input type="date" value={rangeTo} min={rangeFrom} onChange={(e) => setRangeTo(e.target.value)} style={{ width: 150 }} />
            </div>
          )}

          <select value={reportYard} onChange={(e) => setReportYard(e.target.value)} style={{ width: 130 }}>
            {YARDS.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
          </select>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn-ghost btn-sm" onClick={() => setShowPreview((v) => !v)} disabled={report.activeCount === 0}>
              {showPreview ? 'Hide Preview' : 'Preview'}
            </button>
            <button
              className="btn-primary btn-sm"
              disabled={report.activeCount === 0 || !rangeValid}
              onClick={() => exportStockMovementPDF({
                periodLabel: period.label,
                yardLabel: YARDS.find((y) => y.id === reportYard).label,
                rows: report.rows,
                totals: report.totals,
              })}
            >
              Download
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-muted)' }}>
          {!rangeValid ? 'The start date must be on or before the end date.'
            : report.activeCount === 0 ? 'Nothing bought or sold in this period.'
            : `${report.activeCount} of ${report.rows.length} items moved · ${fmt(report.totals.purchaseWeight)} kg purchased · ${fmt(report.totals.saleWeight)} kg sold`}
        </div>

        {showPreview && report.activeCount > 0 && (
          <div style={{ marginTop: 14, border: '1px solid var(--border)', borderRadius: 8, overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th style={{ textAlign: 'right' }}>Purchased (kg)</th>
                  <th style={{ textAlign: 'right' }}>Purchased Value</th>
                  <th style={{ textAlign: 'right' }}>Sold (kg)</th>
                  <th style={{ textAlign: 'right' }}>Sold Value</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.name} style={r.active ? { background: 'var(--primary-light)' } : undefined}>
                    <td style={{ fontWeight: r.active ? 700 : 400, color: r.active ? '#166534' : 'var(--text-muted)' }}>{r.name}</td>
                    <td style={{ textAlign: 'right', fontWeight: r.active ? 600 : 400, color: r.active ? '#15803d' : 'var(--text-muted)' }}>{fmt(r.purchaseWeight)}</td>
                    <td style={{ textAlign: 'right', color: r.active ? '#15803d' : 'var(--text-muted)' }}>{fmt(r.purchaseValue)}</td>
                    <td style={{ textAlign: 'right', fontWeight: r.active ? 600 : 400, color: r.active ? '#dc2626' : 'var(--text-muted)' }}>{fmt(r.saleWeight)}</td>
                    <td style={{ textAlign: 'right', color: r.active ? '#dc2626' : 'var(--text-muted)' }}>{fmt(r.saleValue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f8fafc' }}>
                  <td style={{ fontWeight: 600, padding: '10px 16px' }}>Total</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, padding: '10px 16px', color: '#15803d' }}>{fmt(report.totals.purchaseWeight)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, padding: '10px 16px', color: '#15803d' }}>{fmt(report.totals.purchaseValue)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, padding: '10px 16px', color: '#dc2626' }}>{fmt(report.totals.saleWeight)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, padding: '10px 16px', color: '#dc2626' }}>{fmt(report.totals.saleValue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        </div>
        )}
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
                <tr key={row.name} style={row.untouched ? { color: 'var(--text-muted)' } : undefined}>
                  <td style={{ fontWeight: row.untouched ? 400 : 500 }}>{row.name}</td>
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
