import { useState, useEffect, useMemo } from 'react';
import api from '../../api/index.js';
import { exportPLPDF } from '../../utils/pdf.js';

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

export default function PLTab() {
  const [transactions, setTransactions] = useState([]);
  const [sales, setSales] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('today');
  const [customFrom, setCustomFrom] = useState(thisMonthRange().from);
  const [customTo, setCustomTo] = useState(thisMonthRange().to);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [txRes, saleRes, expRes] = await Promise.all([
        api.get('/transactions'),
        api.get('/sales'),
        api.get('/expenses'),
      ]);
      setTransactions(txRes.data);
      setSales(saleRes.data);
      setExpenses(expRes.data);
    } finally {
      setLoading(false);
    }
  };

  const { from, to } = useMemo(() => {
    const todayStr = today();
    if (period === 'today') return { from: todayStr, to: todayStr };
    if (period === 'month') return thisMonthRange();
    return { from: customFrom, to: customTo };
  }, [period, customFrom, customTo]);

  const filteredTransactions = useMemo(
    () => transactions.filter((tx) => inRange(localDate(tx.createdAt), from, to)),
    [transactions, from, to]
  );
  const filteredSales = useMemo(
    () => sales.filter((s) => inRange(localDate(s.createdAt), from, to)),
    [sales, from, to]
  );
  const filteredExpenses = useMemo(
    () => expenses.filter((e) => inRange(localDate(e.createdAt), from, to)),
    [expenses, from, to]
  );

  const totalRevenue = useMemo(
    () => filteredSales.reduce((sum, s) => sum + s.grandTotal, 0),
    [filteredSales]
  );
  const totalPurchases = useMemo(
    () => filteredTransactions.reduce((sum, tx) => sum + tx.grandTotal, 0),
    [filteredTransactions]
  );
  const totalExpenses = useMemo(
    () => filteredExpenses.reduce((sum, e) => sum + e.amount, 0),
    [filteredExpenses]
  );
  const netPL = totalRevenue - totalPurchases - totalExpenses;

  const fmt = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 });

  if (loading) return <div className="empty-state">Loading...</div>;

  return (
    <div>
      {/* Period filter */}
      <div className="card" style={{ marginBottom: 20, padding: '14px 20px' }}>
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
          <div style={{ marginLeft: 'auto' }}>
            <button
              className="btn-ghost btn-sm"
              onClick={() => exportPLPDF({ from, to, filteredTransactions, filteredSales, filteredExpenses, totalRevenue, totalPurchases, totalExpenses, netPL })}
            >
              ↓ PDF
            </button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        <SummaryCard label="Sales Revenue" value={fmt(totalRevenue)} color="var(--primary-dark)" bg="var(--primary-light)" />
        <SummaryCard label="Purchases Cost" value={fmt(totalPurchases)} color="#b45309" bg="#fef3c7" />
        <SummaryCard label="Expenses" value={fmt(totalExpenses)} color="#dc2626" bg="#fee2e2" />
        <SummaryCard
          label="Net Profit / Loss"
          value={(netPL >= 0 ? '+' : '') + fmt(netPL)}
          color={netPL >= 0 ? 'var(--primary-dark)' : '#dc2626'}
          bg={netPL >= 0 ? '#dcfce7' : '#fee2e2'}
          large
        />
      </div>

      {/* Three section tables */}
      <div style={{ display: 'grid', gap: 20 }}>
        {/* Sales */}
        <Section title="Sales" count={filteredSales.length} total={fmt(totalRevenue)} color="var(--primary-dark)">
          {filteredSales.length === 0 ? (
            <div className="empty-state">No sales in this period.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((s) => (
                  <tr key={s._id}>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13, whiteSpace: 'nowrap' }}>
                      {new Date(s.createdAt).toLocaleDateString()}
                    </td>
                    <td>{s.customerName || '—'}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                      {s.items.map((i) => i.materialName).join(', ')}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary-dark)' }}>
                      {fmt(s.grandTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* Purchases */}
        <Section title="Purchases" count={filteredTransactions.length} total={fmt(totalPurchases)} color="#b45309">
          {filteredTransactions.length === 0 ? (
            <div className="empty-state">No purchases in this period.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Supplier</th>
                  <th>Items</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((tx) => (
                  <tr key={tx._id}>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13, whiteSpace: 'nowrap' }}>
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </td>
                    <td>{tx.supplierName || '—'}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                      {tx.items.map((i) => i.materialName).join(', ')}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#b45309' }}>
                      {fmt(tx.grandTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* Expenses */}
        <Section title="Expenses" count={filteredExpenses.length} total={fmt(totalExpenses)} color="#dc2626">
          {filteredExpenses.length === 0 ? (
            <div className="empty-state">No expenses in this period.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Tags</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((e) => (
                  <tr key={e._id}>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13, whiteSpace: 'nowrap' }}>
                      {new Date(e.createdAt).toLocaleDateString()}
                    </td>
                    <td>{e.description || '—'}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                      {e.tags?.map((t) => t.name).join(', ') || '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>
                      {fmt(e.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color, bg, large }) {
  return (
    <div className="card" style={{ padding: '18px 20px', background: bg, border: 'none' }}>
      <div style={{ fontSize: large ? 26 : 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color, opacity: 0.7, marginTop: 4, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function Section({ title, count, total, color, children }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color }}>{title}</h2>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{count} records</span>
          <span style={{ fontWeight: 700, color, fontSize: 15 }}>{total}</span>
        </div>
      </div>
      {children}
    </div>
  );
}
