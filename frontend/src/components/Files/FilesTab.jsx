import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import api from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,application/pdf';
const ROOT = 'root';
const isImage = (f) => f.mimeType.startsWith('image/');

const fmtSize = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const errMsg = (err, fallback) => err.response?.data?.message || fallback;

// Files sit behind auth, so a plain src can't load them — fetch with the token and hand the
// browser a blob URL. Lazy, so a long grid doesn't pull every file at once.
function useAuthBlob(fileId, enabled = true) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { rootMargin: '200px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [enabled]);

  useEffect(() => {
    if (!visible || !enabled) return;
    let objectUrl;
    let cancelled = false;
    api.get(`/files/${fileId}/content`, { responseType: 'blob' })
      .then(({ data }) => { if (!cancelled) { objectUrl = URL.createObjectURL(data); setUrl(objectUrl); } })
      .catch(() => {});
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [visible, fileId, enabled]);

  return [ref, url];
}

function PdfGlyph({ size = 40 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: '#dc2626' }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
      </svg>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em' }}>PDF</span>
    </div>
  );
}

function Thumb({ file, style }) {
  const [ref, url] = useAuthBlob(file._id, isImage(file));
  return (
    <div ref={ref} style={{ background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>
      {!isImage(file) ? <PdfGlyph />
        : url ? <img src={url} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Loading…</span>}
    </div>
  );
}

function Preview({ file }) {
  const [ref, url] = useAuthBlob(file._id);
  return (
    <div ref={ref} style={{ background: 'var(--bg)', borderRadius: 6, minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {!url ? <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</span>
        : isImage(file) ? <img src={url} alt={file.name} style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 140px)', objectFit: 'contain' }} />
        : <iframe src={url} title={file.name} style={{ width: '100%', height: 'calc(100vh - 160px)', minHeight: 320, border: 'none' }} />}
    </div>
  );
}

const FolderIcon = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
);

export default function FilesTab() {
  const { isSuperAdmin } = useAuth();
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [loading, setLoading] = useState(true);

  const [picked, setPicked] = useState([]);
  const [uploadName, setUploadName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);

  const [newFolder, setNewFolder] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [search, setSearch] = useState('');
  const [openFile, setOpenFile] = useState(null);

  const loadFolders = useCallback(() => api.get('/folders').then(({ data }) => setFolders(data)), []);
  const loadFiles = useCallback(() => {
    const params = search.trim() ? { search: search.trim() } : { folder: currentId || ROOT };
    return api.get('/files', { params }).then(({ data }) => setFiles(data));
  }, [search, currentId]);

  useEffect(() => { loadFolders(); }, [loadFolders]);
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => { loadFiles().finally(() => setLoading(false)); }, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [loadFiles, search]);

  const byId = useMemo(() => new Map(folders.map((f) => [f._id, f])), [folders]);
  const pathOf = useCallback((id) => {
    const parts = [];
    let cur = byId.get(id);
    while (cur) { parts.unshift(cur); cur = cur.parent ? byId.get(cur.parent) : null; }
    return parts;
  }, [byId]);
  const labelOf = useCallback((id) => (id ? pathOf(id).map((f) => f.name).join(' / ') : 'Files'), [pathOf]);

  const subfolders = useMemo(
    () => folders.filter((f) => String(f.parent || '') === String(currentId || '')).sort((a, b) => a.name.localeCompare(b.name)),
    [folders, currentId]
  );
  const searching = Boolean(search.trim());
  const breadcrumb = [{ _id: null, name: 'Files' }, ...pathOf(currentId)];

  const previews = useMemo(() => picked.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null)), [picked]);
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews]);

  const resetUpload = () => {
    setPicked([]);
    setUploadName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!picked.length) return;
    setUploadError('');
    setUploading(true);
    try {
      const body = new FormData();
      picked.forEach((f) => body.append('files', f));
      if (picked.length === 1 && uploadName.trim()) body.append('name', uploadName.trim());
      body.append('folder', currentId || ROOT);
      await api.post('/files', body);
      resetUpload();
      if (searching) setSearch('');
      else await loadFiles();
    } catch (err) {
      setUploadError(errMsg(err, 'Upload failed'));
    } finally {
      setUploading(false);
    }
  };

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    const name = newFolder.trim();
    if (!name) return;
    setCreatingFolder(true);
    try {
      await api.post('/folders', { name, parent: currentId || ROOT });
      setNewFolder('');
      await loadFolders();
    } catch (err) {
      alert(errMsg(err, 'Could not create the folder'));
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleRenameFolder = async (folder) => {
    const name = prompt('Rename folder', folder.name);
    if (!name || name.trim() === folder.name) return;
    try {
      await api.patch(`/folders/${folder._id}`, { name: name.trim() });
      await loadFolders();
    } catch (err) {
      alert(errMsg(err, 'Could not rename the folder'));
    }
  };

  const handleDeleteFolder = async (folder) => {
    if (!confirm(`Delete folder "${folder.name}"?`)) return;
    try {
      await api.delete(`/folders/${folder._id}`);
      await loadFolders();
    } catch (err) {
      alert(errMsg(err, 'Could not delete the folder'));
    }
  };

  const afterFileChange = async (updated) => {
    await loadFiles();
    setOpenFile(updated || null);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>
      {/* Left: new folder + upload */}
      <div>
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>New Folder</h2>
          <form onSubmit={handleCreateFolder} style={{ display: 'flex', gap: 6 }}>
            <input type="text" placeholder="Folder name" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} />
            <button type="submit" className="btn-primary" disabled={creatingFolder || !newFolder.trim()} style={{ whiteSpace: 'nowrap' }}>Create</button>
          </form>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            Created inside <strong>{labelOf(currentId)}</strong>
          </p>
        </div>

        <div className="card">
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Add Files</h2>
          <form onSubmit={handleUpload}>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <input ref={fileInputRef} type="file" accept={ACCEPT} multiple onChange={(e) => setPicked(Array.from(e.target.files || []))} />
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Photos or PDFs · up to 15 MB each · 20 at a time</p>
            </div>

            {picked.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 12 }}>
                {picked.map((f, i) => (
                  <div key={`${f.name}-${i}`} title={f.name} style={{ aspectRatio: '1', borderRadius: 6, overflow: 'hidden', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {previews[i] ? <img src={previews[i]} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <PdfGlyph size={22} />}
                  </div>
                ))}
              </div>
            )}

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Name</label>
              {picked.length > 1 ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{picked.length} files — each keeps its own filename.</p>
              ) : (
                <input type="text" placeholder={picked[0] ? picked[0].name.replace(/\.[^.]+$/, '') : 'Defaults to the filename'} value={uploadName} onChange={(e) => setUploadName(e.target.value)} />
              )}
            </div>

            {uploadError && <p className="error-msg" style={{ marginBottom: 10 }}>{uploadError}</p>}
            <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={uploading || !picked.length}>
              {uploading ? 'Uploading…' : picked.length > 1 ? `Upload ${picked.length} Files` : 'Upload'}
            </button>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
              Into <strong>{labelOf(currentId)}</strong>
            </p>
          </form>
        </div>
      </div>

      {/* Right: browser */}
      <div>
        <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="search" placeholder="Search all files by name…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: '1 1 240px' }} />
            <span style={{ color: 'var(--text-muted)', fontSize: 13, whiteSpace: 'nowrap' }}>
              {files.length} {files.length === 1 ? 'file' : 'files'}{!searching && subfolders.length ? ` · ${subfolders.length} folder${subfolders.length > 1 ? 's' : ''}` : ''}
            </span>
          </div>

          {!searching && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 13, flexWrap: 'wrap' }}>
              {breadcrumb.map((crumb, i) => (
                <span key={crumb._id || 'root'} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {i > 0 && <span style={{ color: 'var(--text-muted)' }}>/</span>}
                  {i === breadcrumb.length - 1 ? (
                    <strong>{crumb.name}</strong>
                  ) : (
                    <button onClick={() => setCurrentId(crumb._id)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary-dark)', fontSize: 13, cursor: 'pointer' }}>
                      {crumb.name}
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>

        {searching && <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>Searching every folder.</p>}

        {!searching && subfolders.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12, marginBottom: 16 }}>
            {subfolders.map((f) => (
              <div key={f._id} className="card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  onClick={() => setCurrentId(f._id)}
                  style={{ background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, cursor: 'pointer', color: 'var(--text)', textAlign: 'left' }}
                >
                  <span style={{ color: 'var(--primary)', display: 'flex' }}><FolderIcon /></span>
                  <span style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                </button>
                <button title="Rename" onClick={() => handleRenameFolder(f)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>✎</button>
                {isSuperAdmin && (
                  <button title="Delete" onClick={() => handleDeleteFolder(f)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 2, fontSize: 16, lineHeight: 1 }}>×</button>
                )}
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div className="card"><div className="empty-state">Loading...</div></div>
        ) : files.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              {searching ? 'No files match your search.' : subfolders.length ? 'No files here — open a folder above.' : 'Nothing here yet. Add files on the left.'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
            {files.map((f) => (
              <div key={f._id} className="card" onClick={() => setOpenFile(f)} style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }}>
                <Thumb file={f} style={{ width: '100%', aspectRatio: '4 / 3' }} />
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.name}>{f.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {new Date(f.createdAt).toLocaleDateString()} · {f.createdBy || '—'}
                  </div>
                  {searching && (
                    <div style={{ fontSize: 11, color: 'var(--primary-dark)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <FolderIcon size={13} /> {labelOf(f.folder)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {openFile && (
        <FileModal
          file={openFile}
          folders={folders}
          labelOf={labelOf}
          canDelete={isSuperAdmin}
          onClose={() => setOpenFile(null)}
          onChanged={afterFileChange}
        />
      )}
    </div>
  );
}

function FileModal({ file, folders, labelOf, canDelete, onClose, onChanged }) {
  const [name, setName] = useState(file.name);
  const [folder, setFolder] = useState(file.folder || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const options = useMemo(
    () => folders.map((f) => ({ id: f._id, label: labelOf(f._id) })).sort((a, b) => a.label.localeCompare(b.label)),
    [folders, labelOf]
  );
  const dirty = name.trim() !== file.name || String(folder) !== String(file.folder || '');

  const save = async () => {
    setError('');
    setSaving(true);
    try {
      const { data } = await api.patch(`/files/${file._id}`, { name, folder: folder || 'root' });
      await onChanged(data);
    } catch (err) {
      setError(errMsg(err, 'Failed to save'));
    } finally {
      setSaving(false);
    }
  };

  const download = async () => {
    try {
      const { data } = await api.get(`/files/${file._id}/content`, { params: { download: 1 }, responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.originalName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      alert('Download failed');
    }
  };

  const remove = async () => {
    if (!confirm(`Delete "${file.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/files/${file._id}`);
      await onChanged(null);
    } catch (err) {
      alert(errMsg(err, 'Failed to delete'));
    }
  };

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 1040, maxHeight: '100%', display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, padding: 20, overflow: 'hidden' }}>
        <Preview file={file} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn-ghost btn-sm" onClick={onClose}>Close</button>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Folder</label>
            <select value={folder} onChange={(e) => setFolder(e.target.value)}>
              <option value="">Files (top level)</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
            <div>File: {file.originalName}</div>
            <div>Size: {fmtSize(file.size)}</div>
            <div>Added {new Date(file.createdAt).toLocaleString()} by {file.createdBy || '—'}</div>
          </div>
          {error && <p className="error-msg" style={{ marginBottom: 0 }}>{error}</p>}
          <button className="btn-primary" onClick={save} disabled={!dirty || saving || !name.trim()}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button className="btn-ghost" onClick={download}>⬇ Download Original</button>
          {canDelete && <button className="btn-danger" onClick={remove}>Delete</button>}
        </div>
      </div>
    </div>
  );
}
