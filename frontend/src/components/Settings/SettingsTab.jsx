import { useState, useEffect } from 'react';
import api from '../../api/index.js';

const fmtBytes = (b) => {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(2)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(b / 1024))} KB`;
};
const errMsg = (err, fallback) => err.response?.data?.message || fallback;

function Card({ title, subtitle, children }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600 }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, marginBottom: 16 }}>{subtitle}</p>}
      {children}
    </div>
  );
}

function Notice({ kind, children }) {
  const palette = {
    success: { bg: '#dcfce7', fg: '#15803d' },
    error: { bg: '#fee2e2', fg: '#b91c1c' },
    warning: { bg: '#fef3c7', fg: '#92400e' },
  }[kind];
  return (
    <div style={{ background: palette.bg, color: palette.fg, borderRadius: 8, padding: '10px 14px', fontSize: 13, marginTop: 12 }}>
      {children}
    </div>
  );
}

export default function SettingsTab() {
  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState('');
  const [downloading, setDownloading] = useState(false);

  const [restoreFile, setRestoreFile] = useState(null);
  const [confirmText, setConfirmText] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [progress, setProgress] = useState(0);
  const [restoreResult, setRestoreResult] = useState(null);
  const [restoreError, setRestoreError] = useState('');

  const [remote, setRemote] = useState(null);
  const [storing, setStoring] = useState(false);
  const [storeResult, setStoreResult] = useState(null);
  const [storeError, setStoreError] = useState('');

  const loadSummary = () => api.get('/backup/summary')
    .then(({ data }) => { setSummary(data); setSummaryError(''); })
    .catch((err) => setSummaryError(errMsg(err, 'Could not load data summary')));
  const loadRemote = () => api.get('/backup/remote').then(({ data }) => setRemote(data)).catch(() => {});

  useEffect(() => { loadSummary(); loadRemote(); }, []);

  const totalRecords = summary ? Object.values(summary.collections).reduce((s, n) => s + n, 0) : 0;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      // A plain navigation lets the browser stream the zip to disk (with its own progress bar)
      // rather than holding the whole file in page memory.
      const { data } = await api.post('/backup/download-token');
      window.location.href = `/api/backup/download?token=${data.token}`;
    } catch (err) {
      alert(errMsg(err, 'Could not start the download'));
    } finally {
      setTimeout(() => setDownloading(false), 3000);
    }
  };

  const handleRestore = async (e) => {
    e.preventDefault();
    setRestoreError('');
    setRestoreResult(null);
    setRestoring(true);
    setProgress(0);
    try {
      const body = new FormData();
      body.append('backup', restoreFile);
      const { data } = await api.post('/backup/restore', body, {
        onUploadProgress: (ev) => ev.total && setProgress(Math.round((ev.loaded / ev.total) * 100)),
      });
      setRestoreResult(data);
      setRestoreFile(null);
      setConfirmText('');
      e.target.reset();
      loadSummary();
    } catch (err) {
      setRestoreError(errMsg(err, 'Restore failed'));
    } finally {
      setRestoring(false);
    }
  };

  const handleStoreRemote = async () => {
    setStoreError('');
    setStoreResult(null);
    setStoring(true);
    try {
      const { data } = await api.post('/backup/remote');
      setStoreResult(data);
      loadRemote();
    } catch (err) {
      setStoreError(errMsg(err, 'Could not store the backup remotely'));
    } finally {
      setStoring(false);
    }
  };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <Card title="Download Backup" subtitle="Everything in the database plus every uploaded image, as one .zip you can restore later.">
        {summaryError && <Notice kind="error">{summaryError}</Notice>}
        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
            <Stat value={totalRecords.toLocaleString()} label={`records in ${Object.keys(summary.collections).length} collections`} />
            <Stat value={summary.uploads.count.toLocaleString()} label="uploaded images" />
            <Stat value={fmtBytes(summary.uploads.bytes)} label="of images" />
          </div>
        )}
        {summary && (
          <details style={{ marginBottom: 16, fontSize: 13 }}>
            <summary style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>What's included</summary>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '4px 16px', marginTop: 8 }}>
              {Object.entries(summary.collections).map(([name, count]) => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{name}</span><span style={{ color: 'var(--text-muted)' }}>{count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </details>
        )}
        <button className="btn-primary" onClick={handleDownload} disabled={downloading}>
          {downloading ? 'Preparing download…' : '⬇ Download Backup'}
        </button>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
          The file contains all business data and user password hashes — store it somewhere private.
        </p>
      </Card>

      <Card title="Restore from Backup" subtitle="Replace all current data and images with the contents of a backup file.">
        <form onSubmit={handleRestore}>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Backup file</label>
            <input type="file" accept=".zip,application/zip" onChange={(e) => { setRestoreFile(e.target.files?.[0] || null); setRestoreResult(null); setRestoreError(''); }} />
          </div>
          {restoreFile && (
            <>
              <Notice kind="warning">
                <strong>This replaces everything.</strong> All records, users and images added since this backup was made will be removed.
                A safety copy of the current data is saved on the server first, and if anything goes wrong during the
                restore the current data is put back automatically.
              </Notice>
              <div className="form-group" style={{ margin: '12px 0' }}>
                <label>Type <strong>RESTORE</strong> to confirm</label>
                <input type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" style={{ maxWidth: 240 }} />
              </div>
              <button type="submit" className="btn-danger" disabled={restoring || confirmText !== 'RESTORE'}>
                {restoring ? (progress < 100 ? `Uploading… ${progress}%` : 'Restoring…') : 'Restore Backup'}
              </button>
            </>
          )}
        </form>
        {restoreError && <Notice kind="error">{restoreError}</Notice>}
        {restoreResult && (
          <Notice kind="success">
            Restored the backup from {new Date(restoreResult.backupCreatedAt).toLocaleString()}:{' '}
            {Object.values(restoreResult.collections).reduce((s, n) => s + n, 0).toLocaleString()} records and{' '}
            {restoreResult.uploads.count} images.{' '}
            <button className="btn-ghost btn-sm" style={{ marginLeft: 6 }} onClick={() => window.location.reload()}>Reload app</button>
          </Notice>
        )}
      </Card>

      <Card title="Remote Storage" subtitle="Keep a copy of your backup off this server.">
        {!remote ? (
          <div className="empty-state">Loading...</div>
        ) : !remote.configured ? (
          <Notice kind="warning">Remote storage isn't set up yet.</Notice>
        ) : (
          <>
            <button className="btn-primary" onClick={handleStoreRemote} disabled={storing}>
              {storing ? 'Storing backup…' : '☁ Store Backup Remotely'}
            </button>
            {storeError && <Notice kind="error">{storeError}</Notice>}
            {storeResult && <Notice kind="success">Backup stored remotely as {storeResult.name}</Notice>}
            {remote.error && <Notice kind="error">{remote.error}</Notice>}
            {remote.backups.length > 0 && (
              <div style={{ marginTop: 16, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                <table>
                  <thead>
                    <tr><th>Stored backup</th><th>Date</th><th style={{ textAlign: 'right' }}>Size</th></tr>
                  </thead>
                  <tbody>
                    {remote.backups.map((b) => (
                      <tr key={b.name}>
                        <td style={{ fontSize: 13, wordBreak: 'break-all' }}>{b.name}</td>
                        <td style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{new Date(b.lastModified).toLocaleString()}</td>
                        <td style={{ fontSize: 13, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtBytes(b.size)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function Stat({ value, label }) {
  return (
    <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 16px' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary-dark)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}
