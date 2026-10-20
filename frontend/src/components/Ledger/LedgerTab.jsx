import { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import useIsNarrow from '../../hooks/useIsNarrow.js';

// Both tabs are the same screen with the debit and credit sides swapped, so they share one
// component. Everything that differs between them lives here.
//
// A payable is a liability: it rises on the credit side, and paying it back debits it.
// A receivable is an asset: it rises on the debit side, and being paid back credits it.
// Either way the outstanding figure is charges - payments, so "pending" reads positive on
// both tabs.
const CONFIG = {
  payable: {
    heading: 'Accounts Payable',
    blurb: 'Money the business owes — loans taken and amounts due on credit. A current liability.',
    chargeNoun: 'Payable',
    chargeVerb: '+ Add Payable',
    chargeHeading: 'Add Payable',
    paymentNoun: 'Repayment',
    totalLabel: 'Total Payable',
    personLabel: 'Pending to pay',
    chargesLabel: 'Total borrowed',
    paymentsLabel: 'Total repaid',
    accent: 'var(--danger)',
    emptyHint: 'Add a person, then record what the business owes them.',
  },
  receivable: {
    heading: 'Accounts Receivable',
    blurb: 'Money owed to the business — loans given and amounts due from credit. A current asset.',
    chargeNoun: 'Receivable',
    chargeVerb: '+ Add Receivable',
    chargeHeading: 'Add Receivable',
    paymentNoun: 'Repayment',
    totalLabel: 'Total Receivable',
    personLabel: 'Pending to collect',
    chargesLabel: 'Total lent',
    paymentsLabel: 'Total received',
    accent: 'var(--primary-dark)',
    emptyHint: 'Add a person, then record what they owe the business.',
  },
};

const pad = (n) => String(n).padStart(2, '0');
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (d) => new Date(d).toLocaleDateString();

function SearchGlyph({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </svg>
  );
}

export default function LedgerTab({ ledger }) {
  const cfg = CONFIG[ledger];
  const { isSuperAdmin } = useAuth();
  // On a phone the statement and the forms become dialogs instead of a second pane.
  const narrow = useIsNarrow(900);

  const [parties, setParties] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  // The directory is shared with the other ledger, so by default only people who have
  // records in this one are listed. Searching looks through everybody.
  const [showAll, setShowAll] = useState(false);

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reload, setReload] = useState(0);

  const [personForm, setPersonForm] = useState(null);
  const [entryForm, setEntryForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadList = useCallback(async () => {
    const params = { ledger };
    if (search.trim()) params.search = search.trim();
    const { data } = await api.get('/parties', { params });
    setParties(data.parties);
    setSummary(data.summary);
  }, [ledger, search]);

  useEffect(() => {
    setLoading(true);
    // Debounced while typing, immediate otherwise.
    const t = setTimeout(() => { loadList().finally(() => setLoading(false)); }, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [loadList, search, reload]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    setDetailLoading(true);
    api.get(`/parties/${selectedId}/entries`, { params: { ledger } })
      .then(({ data }) => setDetail(data))
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [selectedId, ledger, reload]);

  const searching = Boolean(search.trim());
  const visible = useMemo(
    () => (searching || showAll ? parties : parties.filter((p) => p.entryCount > 0)),
    [parties, searching, showAll]
  );
  const hiddenCount = parties.length - parties.filter((p) => p.entryCount > 0).length;

  const refresh = () => setReload((n) => n + 1);

  /* ---------- person ---------- */

  const openAddPerson = () => { setError(''); setPersonForm({ id: null, name: '', phone: '' }); };
  const openEditPerson = (p) => { setError(''); setPersonForm({ id: p._id, name: p.name, phone: p.phone }); };

  const savePerson = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (personForm.id) {
        await api.put(`/parties/${personForm.id}`, { name: personForm.name, phone: personForm.phone });
      } else {
        const { data } = await api.post('/parties', { name: personForm.name, phone: personForm.phone });
        setSelectedId(data._id);
      }
      setPersonForm(null);
      refresh();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const deletePerson = async (p) => {
    if (!confirm(`Delete ${p.name}?`)) return;
    try {
      await api.delete(`/parties/${p._id}`);
      if (selectedId === p._id) setSelectedId(null);
      refresh();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete');
    }
  };

  /* ---------- records ---------- */

  const openEntry = (kind) => {
    setError('');
    setEntryForm({ kind, amount: '', entryDate: todayStr(), description: '' });
  };

  const saveEntry = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post(`/parties/${selectedId}/entries`, {
        ledger,
        kind: entryForm.kind,
        amount: Number(entryForm.amount),
        entryDate: entryForm.entryDate,
        description: entryForm.description,
      });
      setEntryForm(null);
      refresh();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (entry) => {
    if (!confirm('Delete this record?')) return;
    try {
      await api.delete(`/parties/${selectedId}/entries/${entry._id}`);
      refresh();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete');
    }
  };

  /* ---------- pieces ---------- */

  const totalsStrip = (
    <div className="stat-grid" style={{ marginBottom: 20 }}>
      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: cfg.accent }}>
          {summary ? money(summary.pending) : '—'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{cfg.totalLabel}</div>
      </div>
      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{summary ? money(summary.charges) : '—'}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{cfg.chargesLabel}</div>
      </div>
      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{summary ? money(summary.payments) : '—'}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{cfg.paymentsLabel}</div>
      </div>
      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{summary ? summary.partiesWithActivity : '—'}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>People with a balance</div>
      </div>
    </div>
  );

  const listPane = (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        {/* On a phone the search box earns its place only once tapped. */}
        {(!narrow || searchOpen) ? (
          <input
            type="search"
            placeholder="Search by name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus={narrow && searchOpen}
            style={{ flex: 1, minWidth: 0 }}
          />
        ) : (
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>People</h2>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
          {narrow && searchOpen && (
            <button className="btn-ghost btn-sm" onClick={() => { setSearch(''); setSearchOpen(false); }} aria-label="Close search">×</button>
          )}
          {narrow && !searchOpen && (
            <button className="btn-ghost btn-sm" onClick={() => setSearchOpen(true)} aria-label="Search people" title="Search people">
              <SearchGlyph />
            </button>
          )}
          <button className="btn-primary btn-sm" onClick={openAddPerson}>+ Person</button>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="empty-state">
          {searching ? 'Nobody matches that name or phone number.' : cfg.emptyHint}
        </div>
      ) : narrow ? (
        /* A table pushes the pending figure off a phone screen, and that figure is the
           whole reason for the row. Stacked rows keep it beside the name. */
        <div>
          {visible.map((p) => (
            <button
              key={p._id}
              onClick={() => setSelectedId(p._id)}
              style={{
                display: 'flex', width: '100%', gap: 12, textAlign: 'left',
                justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 18px', borderRadius: 0,
                borderBottom: '1px solid var(--border)',
                background: p._id === selectedId ? 'var(--primary-light)' : 'transparent',
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 500 }}>{p.name}</span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>{p.phone}</span>
              </span>
              <span style={{ textAlign: 'right', flex: '0 0 auto' }}>
                <span style={{ display: 'block', fontWeight: 600, color: p.pending > 0 ? cfg.accent : 'var(--text-muted)' }}>
                  {money(p.pending)}
                </span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>
                  {p.entryCount} {p.entryCount === 1 ? 'record' : 'records'}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th style={{ textAlign: 'right' }}>{cfg.personLabel}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr
                key={p._id}
                onClick={() => setSelectedId(p._id)}
                style={{
                  cursor: 'pointer',
                  background: p._id === selectedId ? 'var(--primary-light)' : undefined,
                }}
              >
                <td>
                  <div style={{ fontWeight: 500 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.phone}</div>
                </td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: p.pending > 0 ? cfg.accent : 'var(--text-muted)' }}>
                  {money(p.pending)}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                    {p.entryCount} {p.entryCount === 1 ? 'record' : 'records'}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!searching && hiddenCount > 0 && (
        <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)' }}>
          <button className="btn-ghost btn-sm" onClick={() => setShowAll((v) => !v)}>
            {showAll
              ? 'Show only people with records'
              : `Show all people (${hiddenCount} more)`}
          </button>
        </div>
      )}
    </div>
  );

  const statement = detail && (
    <>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700 }}>{detail.party.name}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{detail.party.phone}</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>
          <button className="btn-ghost btn-sm" onClick={() => openEditPerson(detail.party)}>Edit</button>
          {isSuperAdmin && (
            <button className="btn-danger btn-sm" onClick={() => deletePerson(detail.party)}>Delete</button>
          )}
          {narrow && (
            <button className="btn-ghost btn-sm" onClick={() => setSelectedId(null)} aria-label="Close">×</button>
          )}
        </div>
      </div>

      {/* The pending figure sits above the records, which is the first thing anyone
          opening a statement wants to know. */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'baseline', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 700, color: detail.summary.pending > 0 ? cfg.accent : 'var(--text-muted)' }}>
            {money(detail.summary.pending)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{cfg.personLabel}</div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {cfg.chargesLabel} {money(detail.summary.charges)} &nbsp;·&nbsp; {cfg.paymentsLabel} {money(detail.summary.payments)}
        </div>
      </div>

      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn-primary btn-sm" onClick={() => openEntry('charge')}>{cfg.chargeVerb}</button>
        <button className="btn-ghost btn-sm" onClick={() => openEntry('payment')}>+ Add {cfg.paymentNoun}</button>
      </div>

      {detail.entries.length === 0 ? (
        <div className="empty-state">No records yet for {detail.party.name}.</div>
      ) : narrow ? (
        /* Five columns do not fit a phone. Each record becomes a row with the side and the
           running balance spelled out, so nothing has to be scrolled sideways to be read. */
        <div>
          {detail.entries.map((e) => (
            <div
              key={e._id}
              style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12 }}
            >
              <div style={{ minWidth: 0 }}>
                <span className="badge" style={{
                  background: e.kind === 'charge' ? 'var(--danger-light)' : 'var(--primary-light)',
                  color: e.kind === 'charge' ? 'var(--danger)' : 'var(--primary-dark)',
                }}>
                  {e.kind === 'charge' ? cfg.chargeNoun : cfg.paymentNoun}
                </span>
                {e.description && (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{e.description}</div>
                )}
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{day(e.entryDate)}</div>
              </div>
              <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {e.side}
                </div>
                <div style={{ fontWeight: 600 }}>{money(e.amount)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Bal {money(e.balance)}</div>
                {isSuperAdmin && (
                  <button className="btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => deleteEntry(e)}>Delete</button>
                )}
              </div>
            </div>
          ))}
          <div style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
            <span>Pending</span>
            <span style={{ color: cfg.accent }}>{money(detail.summary.pending)}</span>
          </div>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Details</th>
              <th style={{ textAlign: 'right' }}>Debit</th>
              <th style={{ textAlign: 'right' }}>Credit</th>
              <th style={{ textAlign: 'right' }}>Balance</th>
              {isSuperAdmin && <th />}
            </tr>
          </thead>
          <tbody>
            {detail.entries.map((e) => (
              <tr key={e._id}>
                <td style={{ whiteSpace: 'nowrap' }}>{day(e.entryDate)}</td>
                <td>
                  <span className="badge" style={{
                    background: e.kind === 'charge' ? 'var(--danger-light)' : 'var(--primary-light)',
                    color: e.kind === 'charge' ? 'var(--danger)' : 'var(--primary-dark)',
                  }}>
                    {e.kind === 'charge' ? cfg.chargeNoun : cfg.paymentNoun}
                  </span>
                  {e.description && <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>{e.description}</span>}
                </td>
                <td style={{ textAlign: 'right' }}>{e.side === 'debit' ? money(e.amount) : ''}</td>
                <td style={{ textAlign: 'right' }}>{e.side === 'credit' ? money(e.amount) : ''}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(e.balance)}</td>
                {isSuperAdmin && (
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn-ghost btn-sm" onClick={() => deleteEntry(e)} aria-label="Delete record">×</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--border)' }}>
              <td colSpan={2} style={{ fontWeight: 700, paddingTop: 8 }}>Pending</td>
              <td colSpan={2} />
              <td style={{ textAlign: 'right', fontWeight: 700, color: cfg.accent, paddingTop: 8 }}>
                {money(detail.summary.pending)}
              </td>
              {isSuperAdmin && <td />}
            </tr>
          </tfoot>
        </table>
      )}
    </>
  );

  const personDialog = personForm && (
    <Dialog onClose={() => setPersonForm(null)} width={360}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
        {personForm.id ? 'Edit Person' : 'Add Person'}
      </h2>
      <form onSubmit={savePerson}>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>Name</label>
          <input
            type="text"
            placeholder="Full name"
            value={personForm.name}
            onChange={(e) => setPersonForm({ ...personForm, name: e.target.value })}
            required
            autoFocus
          />
        </div>
        <div className="form-group" style={{ marginBottom: 16 }}>
          <label>Phone</label>
          <input
            type="tel"
            placeholder="077 123 4567"
            value={personForm.phone}
            onChange={(e) => setPersonForm({ ...personForm, phone: e.target.value })}
            required
          />
        </div>
        {error && <p className="error-msg" style={{ marginBottom: 10 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={saving}>
            {saving ? 'Saving…' : personForm.id ? 'Update' : 'Add Person'}
          </button>
          <button type="button" className="btn-ghost" onClick={() => setPersonForm(null)}>Cancel</button>
        </div>
      </form>
    </Dialog>
  );

  const entryDialog = entryForm && (
    <Dialog onClose={() => setEntryForm(null)} width={360}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
        {entryForm.kind === 'charge' ? cfg.chargeHeading : `Add ${cfg.paymentNoun}`}
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
        {detail?.party.name} · {entryForm.kind === 'charge'
          ? (ledger === 'payable' ? 'raises what we owe' : 'raises what they owe')
          : (ledger === 'payable' ? 'lowers what we owe' : 'lowers what they owe')}
      </p>
      <form onSubmit={saveEntry}>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>Amount</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            placeholder="0.00"
            value={entryForm.amount}
            onChange={(e) => setEntryForm({ ...entryForm, amount: e.target.value })}
            required
            autoFocus
          />
        </div>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>Date</label>
          <input
            type="date"
            value={entryForm.entryDate}
            onChange={(e) => setEntryForm({ ...entryForm, entryDate: e.target.value })}
            required
          />
        </div>
        <div className="form-group" style={{ marginBottom: 16 }}>
          <label>Details <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
          <input
            type="text"
            placeholder="What this is for"
            value={entryForm.description}
            onChange={(e) => setEntryForm({ ...entryForm, description: e.target.value })}
          />
        </div>
        {error && <p className="error-msg" style={{ marginBottom: 10 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn-ghost" onClick={() => setEntryForm(null)}>Cancel</button>
        </div>
      </form>
    </Dialog>
  );

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>{cfg.heading}</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{cfg.blurb}</p>
      </div>

      {totalsStrip}

      {narrow ? (
        <>
          {listPane}
          {selectedId && (
            <Dialog onClose={() => setSelectedId(null)} width={680} padded={false}>
              {detailLoading && !detail ? <div className="empty-state">Loading…</div> : statement}
            </Dialog>
          )}
        </>
      ) : (
        <div className="split" style={{ '--split-col': '340px' }}>
          {listPane}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {!selectedId ? (
              <div className="empty-state">Pick someone to see their records.</div>
            ) : detailLoading && !detail ? (
              <div className="empty-state">Loading…</div>
            ) : (
              statement
            )}
          </div>
        </div>
      )}

      {personDialog}
      {entryDialog}
    </>
  );
}

function Dialog({ children, onClose, width = 360, padded = true }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 12,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="card"
        style={{
          width, maxWidth: '100%', boxShadow: 'var(--shadow-md)',
          maxHeight: '88vh', overflowY: 'auto', padding: padded ? undefined : 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}
