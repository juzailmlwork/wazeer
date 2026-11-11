const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
const PREVIEW = 8;

/**
 * Confirms approving a batch of pending records.
 *
 * Approving in bulk is the one action here that cannot be undone one row at a time, so the
 * dialog shows exactly what is about to change: the count, the money involved, the filters
 * that produced the set, and the first few rows by name. A bare "are you sure?" would not
 * tell anyone whether the period they left set last week is still in effect.
 */
export default function ApproveAllDialog({ rows, scope, noun, partyKey, busy, onConfirm, onCancel }) {
  const total = rows.reduce((sum, r) => sum + (Number(r.grandTotal) || 0), 0);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 12,
      }}
      onClick={(e) => e.target === e.currentTarget && !busy && onCancel()}
    >
      <div className="card" style={{ width: 460, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: 'var(--shadow-md)' }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>
          Approve {rows.length} {noun}{rows.length === 1 ? '' : 's'}?
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
          Everything still pending in the list you are looking at — <strong>{scope}</strong>.
        </p>

        <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: 'var(--text-muted)' }}>Combined value</span>
            <strong style={{ color: 'var(--primary-dark)' }}>{money(total)}</strong>
          </div>
        </div>

        <ul style={{ listStyle: 'none', marginBottom: 16, fontSize: 13 }}>
          {rows.slice(0, PREVIEW).map((r) => (
            <li
              key={r._id}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}
            >
              <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {new Date(r.createdAt).toLocaleDateString()}
              </span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r[partyKey] || '—'}
              </span>
              <strong style={{ whiteSpace: 'nowrap' }}>{money(r.grandTotal)}</strong>
            </li>
          ))}
        </ul>
        {rows.length > PREVIEW && (
          <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: -8, marginBottom: 16 }}>
            and {rows.length - PREVIEW} more
          </p>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-primary" style={{ flex: 1 }} onClick={onConfirm} disabled={busy}>
            {busy ? 'Approving…' : `Approve all ${rows.length}`}
          </button>
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
