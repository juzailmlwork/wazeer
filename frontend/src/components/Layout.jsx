import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import BuyTab from './Buy/BuyTab.jsx';
import ItemsTab from './Items/ItemsTab.jsx';
import SuppliersTab from './Suppliers/SuppliersTab.jsx';
import ExpensesTab from './Expenses/ExpensesTab.jsx';
import PurchasesTab from './Purchases/PurchasesTab.jsx';

const TABS = [
  { id: 'buy', label: '🛒 Buy' },
  { id: 'purchases', label: '📋 Purchases' },
  { id: 'items', label: '📦 Items' },
  { id: 'suppliers', label: '🏭 Suppliers' },
  { id: 'expenses', label: '💸 Expenses' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('buy');

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        background: 'white',
        borderBottom: '1px solid var(--border)',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 56,
        boxShadow: 'var(--shadow)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>♻️</span>
          <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--primary)' }}>Wazeer</span>
        </div>

        {/* Tabs */}
        <nav style={{ display: 'flex', gap: 4 }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: activeTab === tab.id ? 'var(--primary-light)' : 'transparent',
                color: activeTab === tab.id ? 'var(--primary-dark)' : 'var(--text-muted)',
                fontWeight: activeTab === tab.id ? 600 : 400,
                border: 'none',
                borderRadius: 6,
                padding: '6px 14px',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* User */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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

      {/* Content */}
      <main style={{ flex: 1, padding: '24px', maxWidth: 1200, width: '100%', margin: '0 auto' }}>
        {activeTab === 'buy' && <BuyTab />}
        {activeTab === 'purchases' && <PurchasesTab />}
        {activeTab === 'items' && <ItemsTab />}
        {activeTab === 'suppliers' && <SuppliersTab />}
        {activeTab === 'expenses' && <ExpensesTab />}
      </main>
    </div>
  );
}
