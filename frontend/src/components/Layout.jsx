import { useState, useRef, useMemo, useCallback, useLayoutEffect, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import useIsNarrow from '../hooks/useIsNarrow.js';
import BuyTab from './Buy/BuyTab.jsx';
import ItemsTab from './Items/ItemsTab.jsx';
import SuppliersTab from './Suppliers/SuppliersTab.jsx';
import ExpensesTab from './Expenses/ExpensesTab.jsx';
import PurchasesTab from './Purchases/PurchasesTab.jsx';
import CustomersTab from './Customers/CustomersTab.jsx';
import SellTab from './Sell/SellTab.jsx';
import SalesTab from './Sales/SalesTab.jsx';
import PLTab from './PL/PLTab.jsx';
import IncomeTab from './Income/IncomeTab.jsx';
import UsersTab from './Users/UsersTab.jsx';
import SalaryTab from './Salary/SalaryTab.jsx';
import StockTab from './Stock/StockTab.jsx';
import FilesTab from './Files/FilesTab.jsx';
import LedgerTab from './Ledger/LedgerTab.jsx';
import SettingsTab from './Settings/SettingsTab.jsx';
import InstallPrompt from './InstallPrompt.jsx';

const TABS = [
  { id: 'buy', label: '🛒 Buy' },
  { id: 'sell', label: '💰 Sell' },
  { id: 'purchases', label: '📋 Purchases' },
  { id: 'sales', label: '📋 Sales' },
  { id: 'expenses', label: '💸 Expenses' },
  { id: 'income', label: '💵 Income' },
  { id: 'pl', label: '📊 P/L', superAdminOnly: true },
  { id: 'items', label: '📦 Items' },
  { id: 'suppliers', label: '🏭 Suppliers' },
  { id: 'customers', label: '👥 Customers' },
  { id: 'salary', label: '💼 Salary' },
  { id: 'stock', label: '📦 Stock' },
  { id: 'files', label: '🗂️ Files' },
  { id: 'payable', label: '🧾 Payable' },
  { id: 'receivable', label: '📥 Receivable' },
  { id: 'users', label: '👤 Users', superAdminOnly: true },
  { id: 'settings', label: '⚙️ Settings', superAdminOnly: true },
];

// The order tabs move into "More" as the window narrows. The six you reach for
// occasionally go first; the daily ones give way last and Buy never does.
//
// This is needed because all fifteen only fit above ~1900px: at 1440 six are cut
// off, at 1280 seven, at 1024 ten. On a phone none of this applies — the strip
// scrolls, which is a familiar gesture there.
const OVERFLOW_ORDER = [
  'settings', 'users', 'receivable', 'payable', 'files', 'stock', 'suppliers', 'customers',
  'salary', 'items', 'pl', 'income', 'expenses', 'sales', 'purchases', 'sell',
];

const GAP = 4;
const sameIds = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

export default function Layout() {
  const { user, logout, isSuperAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('buy');

  // A phone keeps the scrollable strip; only the desktop header needs a More menu.
  const narrow = useIsNarrow(900);

  const navRef = useRef(null);
  const moreRef = useRef(null);
  // Tab widths never change (fixed labels, fixed font), so they are measured once and
  // reused. They have to be: a tab inside More is unmounted and cannot be re-measured.
  const widths = useRef(new Map());
  const [overflowIds, setOverflowIds] = useState([]);
  const [moreOpen, setMoreOpen] = useState(false);

  const visibleTabs = useMemo(
    () => TABS.filter((t) => !t.superAdminOnly || isSuperAdmin),
    [isSuperAdmin]
  );

  const recompute = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    if (narrow) {
      setOverflowIds((prev) => (prev.length ? [] : prev));
      return;
    }

    // Record whatever is on screen right now; on the first pass that is everything.
    nav.querySelectorAll('[data-tab]').forEach((el) => {
      const { tab } = el.dataset;
      if (!widths.current.has(tab)) widths.current.set(tab, el.getBoundingClientRect().width);
    });
    const moreWidth = moreRef.current?.getBoundingClientRect().width || 84;

    const available = nav.clientWidth;
    const width = (id) => widths.current.get(id) ?? 95;
    const spanOf = (ids, withMore) =>
      ids.reduce((sum, id) => sum + width(id), 0)
      + Math.max(0, ids.length - 1) * GAP
      + (withMore ? moreWidth + GAP : 0);

    const all = visibleTabs.map((t) => t.id);
    if (spanOf(all, false) <= available) {
      setOverflowIds((prev) => (prev.length ? [] : prev));
      return;
    }

    let shown = all;
    const moved = [];
    for (const id of OVERFLOW_ORDER) {
      if (!shown.includes(id)) continue;
      shown = shown.filter((x) => x !== id);
      moved.push(id);
      if (spanOf(shown, true) <= available) break;
    }
    setOverflowIds((prev) => (sameIds(prev, moved) ? prev : moved));
  }, [narrow, visibleTabs]);

  // Before paint, so tabs never flash in the header and then disappear.
  useLayoutEffect(recompute, [recompute]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(recompute);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [recompute]);

  useEffect(() => {
    if (!moreOpen) return undefined;
    const onDown = (e) => { if (!moreRef.current?.contains(e.target)) setMoreOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setMoreOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  const overflowSet = new Set(overflowIds);
  const inBar = visibleTabs.filter((t) => !overflowSet.has(t.id));
  // Listed in the app's own order, not the order they happened to be evicted in.
  const inMore = visibleTabs.filter((t) => overflowSet.has(t.id));
  const activeIsHidden = overflowSet.has(activeTab);

  const tabStyle = (id) => ({
    background: activeTab === id ? 'var(--primary-light)' : 'transparent',
    color: activeTab === id ? 'var(--primary-dark)' : 'var(--text-muted)',
    fontWeight: activeTab === id ? 600 : 400,
    border: 'none',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 14,
    cursor: 'pointer',
  });

  const choose = (id) => { setActiveTab(id); setMoreOpen(false); };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          <img src="/logo-mark.png" alt="" width={28} height={27} style={{ display: 'block' }} />
          <span>FWR Recyclers</span>
        </div>

        <nav className="tab-strip" ref={navRef}>
          {inBar.map((tab) => (
            <button key={tab.id} data-tab={tab.id} onClick={() => choose(tab.id)} style={tabStyle(tab.id)}>
              {tab.label}
            </button>
          ))}

          {inMore.length > 0 && (
            <div ref={moreRef} style={{ position: 'relative', flex: '0 0 auto' }}>
              <button
                onClick={() => setMoreOpen((v) => !v)}
                aria-haspopup="true"
                aria-expanded={moreOpen}
                style={{
                  ...tabStyle(activeIsHidden ? activeTab : '__none__'),
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  whiteSpace: 'nowrap',
                }}
              >
                More
                <span style={{ fontSize: 10, transform: moreOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
              </button>

              {moreOpen && (
                <div
                  style={{
                    position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 200,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 8, boxShadow: 'var(--shadow-md)', padding: 4, minWidth: 180,
                  }}
                >
                  {inMore.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => choose(tab.id)}
                      style={{ ...tabStyle(tab.id), display: 'block', width: '100%', textAlign: 'left' }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>

        <div className="app-user">
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {user?.name}
            {user?.role === 'super_admin' && (
              <span className="badge" style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)', marginLeft: 6 }}>
                Super Admin
              </span>
            )}
          </span>
          <button className="btn-ghost btn-sm" onClick={logout}>Logout</button>
        </div>
      </header>

      <main className="app-main">
        {activeTab === 'buy' && <BuyTab />}
        {activeTab === 'sell' && <SellTab />}
        {activeTab === 'purchases' && <PurchasesTab />}
        {activeTab === 'sales' && <SalesTab />}
        {activeTab === 'items' && <ItemsTab />}
        {activeTab === 'suppliers' && <SuppliersTab />}
        {activeTab === 'customers' && <CustomersTab />}
        {activeTab === 'expenses' && <ExpensesTab />}
        {activeTab === 'income' && <IncomeTab />}
        {activeTab === 'salary' && <SalaryTab />}
        {activeTab === 'stock' && <StockTab />}
        {activeTab === 'files' && <FilesTab />}
        {activeTab === 'payable' && <LedgerTab key="payable" ledger="payable" />}
        {activeTab === 'receivable' && <LedgerTab key="receivable" ledger="receivable" />}
        {activeTab === 'users' && isSuperAdmin && <UsersTab />}
        {activeTab === 'settings' && isSuperAdmin && <SettingsTab />}
        {activeTab === 'pl' && <PLTab />}
      </main>

      <InstallPrompt />
    </div>
  );
}
