import { useState, useEffect, useMemo, useRef } from 'react';
import api from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';

const TAG_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#06b6d4'];
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

const fmtSize = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

// Images sit behind auth, so <img src> can't load them directly — fetch with the token
// and hand the browser a blob URL. Lazy so a long grid doesn't pull every image at once.
function AuthImage({ fileId, alt, style }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { rootMargin: '200px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let url;
    let cancelled = false;
    api.get(`/files/${fileId}/content`, { responseType: 'blob' })
      .then(({ data }) => {
        if (cancelled) return;
        url = URL.createObjectURL(data);
        setSrc(url);
      })
      .catch(() => {});
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [visible, fileId]);

  return (
    <div ref={ref} style={{ background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>
      {src
        ? <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: style?.objectFit || 'cover', display: 'block' }} />
        : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Loading…</span>}
    </div>
  );
}

function TagChip({ tag, onRemove }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 500,
      background: tag.color, color: 'white',
    }}>
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1, opacity: 0.8 }}
        >
          ×
        </button>
      )}
    </span>
  );
}

// Type to filter existing tags; if nothing matches exactly, Enter (or the "+ Create" row) makes a new one.
function TagPicker({ tags, selected, onChange, onCreate }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const q = query.trim().toLowerCase();
  const options = tags.filter((t) => !selected.includes(t._id) && t.name.toLowerCase().includes(q));
  const exact = tags.find((t) => t.name.toLowerCase() === q);

  // Close after each pick so the list can't sit over whatever is below it (e.g. the Upload button).
  const pick = (id) => {
    onChange([...selected, id]);
    setQuery('');
    setOpen(false);
  };

  const create = async () => {
    const name = query.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const tag = await onCreate(name);
      if (tag) pick(tag._id);
    } finally {
      setCreating(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!q) return;
    if (exact) { if (!selected.includes(exact._id)) pick(exact._id); else { setQuery(''); setOpen(false); } }
    else if (options.length === 1) pick(options[0]._id);
    else create();
  };

  const rowStyle = { padding: '8px 12px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 };
  const hover = {
    onMouseEnter: (e) => { e.currentTarget.style.background = 'var(--primary-light)'; },
    onMouseLeave: (e) => { e.currentTarget.style.background = 'white'; },
  };

  return (
    <div ref={boxRef}>
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {selected.map((id) => {
            const tag = tags.find((t) => t._id === id);
            return tag && <TagChip key={id} tag={tag} onRemove={() => onChange(selected.filter((s) => s !== id))} />;
          })}
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          placeholder="Type to find or create a tag…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {open && (options.length > 0 || (q && !exact)) && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, marginTop: 2,
            background: 'white', border: '1px solid var(--border)', borderRadius: 6,
            boxShadow: 'var(--shadow-md)', maxHeight: 220, overflowY: 'auto',
          }}>
            {options.map((t) => (
              <div key={t._id} style={rowStyle} onMouseDown={(e) => { e.preventDefault(); pick(t._id); }} {...hover}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                {t.name}
              </div>
            ))}
            {q && !exact && (
              <div
                style={{ ...rowStyle, color: 'var(--primary-dark)', fontWeight: 500, borderTop: options.length ? '1px solid var(--border)' : 'none' }}
                onMouseDown={(e) => { e.preventDefault(); create(); }}
                {...hover}
              >
                {creating ? 'Creating…' : `+ Create tag "${query.trim()}"`}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function FilesTab() {
  const { isSuperAdmin } = useAuth();
  const [files, setFiles] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);

  const [picked, setPicked] = useState([]);
  const [uploadName, setUploadName] = useState('');
  const [uploadTags, setUploadTags] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);

  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [openFile, setOpenFile] = useState(null);

  useEffect(() => {
    Promise.all([api.get('/files'), api.get('/file-tags')])
      .then(([f, t]) => { setFiles(f.data); setTags(t.data); })
      .finally(() => setLoading(false));
  }, []);

  const previews = useMemo(() => picked.map((f) => URL.createObjectURL(f)), [picked]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const createTag = async (name) => {
    try {
      const { data } = await api.post('/file-tags', { name, color: TAG_COLORS[tags.length % TAG_COLORS.length] });
      setTags((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      return data;
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create tag');
      return null;
    }
  };

  const deleteTag = async (tag) => {
    if (!confirm(`Delete tag "${tag.name}"? It will be removed from every file.`)) return;
    try {
      await api.delete(`/file-tags/${tag._id}`);
      setTags((prev) => prev.filter((t) => t._id !== tag._id));
      setFiles((prev) => prev.map((f) => ({ ...f, tags: f.tags.filter((t) => t._id !== tag._id) })));
      setUploadTags((prev) => prev.filter((id) => id !== tag._id));
      if (filterTag === tag._id) setFilterTag('');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete tag');
    }
  };

  const resetUpload = () => {
    setPicked([]);
    setUploadName('');
    setUploadTags([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (picked.length === 0) return;
    setUploadError('');
    setUploading(true);
    try {
      const body = new FormData();
      picked.forEach((f) => body.append('files', f));
      if (picked.length === 1 && uploadName.trim()) body.append('name', uploadName.trim());
      body.append('tags', JSON.stringify(uploadTags));
      const { data } = await api.post('/files', body);
      setFiles((prev) => [...data, ...prev]);
      resetUpload();
    } catch (err) {
      setUploadError(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return files.filter((f) =>
      (!q || f.name.toLowerCase().includes(q)) &&
      (!filterTag || f.tags.some((t) => t._id === filterTag)));
  }, [files, search, filterTag]);

  const onFileSaved = (updated) => {
    setFiles((prev) => prev.map((f) => (f._id === updated._id ? updated : f)));
    setOpenFile(updated);
  };

  const onFileDeleted = (id) => {
    setFiles((prev) => prev.filter((f) => f._id !== id));
    setOpenFile(null);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20, alignItems: 'start' }}>
      {/* Upload */}
      <div className="card">
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Add Images</h2>
        <form onSubmit={handleUpload}>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Images</label>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              multiple
              onChange={(e) => setPicked(Array.from(e.target.files || []))}
            />
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>JPG, PNG, WEBP or GIF · up to 15 MB each · 20 at a time</p>
          </div>

          {picked.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 12 }}>
              {previews.map((url, i) => (
                <img key={url} src={url} alt={picked[i].name} title={picked[i].name}
                  style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 6 }} />
              ))}
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Name</label>
            {picked.length > 1 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{picked.length} images — each keeps its own filename. Rename them after uploading.</p>
            ) : (
              <input
                type="text"
                placeholder={picked[0] ? picked[0].name.replace(/\.[^.]+$/, '') : 'Defaults to the filename'}
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
              />
            )}
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Tags</label>
            <TagPicker tags={tags} selected={uploadTags} onChange={setUploadTags} onCreate={createTag} />
          </div>

          {uploadError && <p className="error-msg" style={{ marginBottom: 10 }}>{uploadError}</p>}
          <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={uploading || picked.length === 0}>
            {uploading ? 'Uploading…' : picked.length > 1 ? `Upload ${picked.length} Images` : 'Upload'}
          </button>
        </form>

        {isSuperAdmin && tags.length > 0 && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Manage Tags
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {tags.map((tag) => (
                <span key={tag._id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: tag.color + '20', color: tag.color, fontSize: 12, fontWeight: 500 }}>
                  {tag.name}
                  <button
                    type="button"
                    onClick={() => deleteTag(tag)}
                    style={{ background: 'none', border: 'none', color: tag.color, cursor: 'pointer', padding: '0 0 0 2px', fontSize: 14, lineHeight: 1 }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Library */}
      <div>
        <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="search"
              placeholder="Search files by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: '1 1 220px' }}
            />
            <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)} style={{ width: 170 }}>
              <option value="">All Tags</option>
              {tags.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
            <span style={{ color: 'var(--text-muted)', fontSize: 13, whiteSpace: 'nowrap' }}>
              {filtered.length} {filtered.length === 1 ? 'file' : 'files'}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="card"><div className="empty-state">Loading...</div></div>
        ) : filtered.length === 0 ? (
          <div className="card">
            <div className="empty-state">{files.length === 0 ? 'No files yet. Add images on the left.' : 'No files match your search.'}</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
            {filtered.map((f) => (
              <div
                key={f._id}
                className="card"
                onClick={() => setOpenFile(f)}
                style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }}
              >
                <AuthImage fileId={f._id} alt={f.name} style={{ width: '100%', aspectRatio: '4 / 3' }} />
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.name}>
                    {f.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {new Date(f.createdAt).toLocaleDateString()} · {f.createdBy || '—'}
                  </div>
                  {f.tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                      {f.tags.map((t) => <TagChip key={t._id} tag={t} />)}
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
          tags={tags}
          canDelete={isSuperAdmin}
          onCreateTag={createTag}
          onClose={() => setOpenFile(null)}
          onSaved={onFileSaved}
          onDeleted={onFileDeleted}
        />
      )}
    </div>
  );
}

function FileModal({ file, tags, canDelete, onCreateTag, onClose, onSaved, onDeleted }) {
  const [name, setName] = useState(file.name);
  const [fileTags, setFileTags] = useState(file.tags.map((t) => t._id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const original = file.tags.map((t) => t._id);
  const dirty = name.trim() !== file.name ||
    fileTags.length !== original.length || fileTags.some((id) => !original.includes(id));

  const save = async () => {
    setError('');
    setSaving(true);
    try {
      const { data } = await api.patch(`/files/${file._id}`, { name, tags: fileTags });
      onSaved(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save');
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
      onDeleted(file._id);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete');
    }
  };

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 980, maxHeight: '100%', display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, padding: 20, overflow: 'hidden' }}>
        <AuthImage fileId={file._id} alt={file.name} style={{ minHeight: 300, maxHeight: 'calc(100vh - 100px)', borderRadius: 6, objectFit: 'contain' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn-ghost btn-sm" onClick={onClose}>Close</button>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Tags</label>
            <TagPicker tags={tags} selected={fileTags} onChange={setFileTags} onCreate={onCreateTag} />
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
