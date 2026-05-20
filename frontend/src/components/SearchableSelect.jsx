import { useState, useRef, useEffect } from 'react';

export default function SearchableSelect({ value, onChange, options, placeholder = 'All', style = {} }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const selected = options.find((o) => o.value === value);

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleOpen = () => {
    setOpen(true);
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSelect = (val) => {
    onChange(val);
    setOpen(false);
    setQuery('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', ...style }}>
      {/* Trigger */}
      <div
        onClick={handleOpen}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 10px', height: 36, borderRadius: 6, fontSize: 13,
          border: '1px solid var(--border)', background: 'white', cursor: 'pointer',
          userSelect: 'none', minWidth: 0,
        }}
      >
        {open ? (
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder="Type to search..."
            style={{
              border: 'none', outline: 'none', padding: 0, fontSize: 13,
              background: 'transparent', width: '100%', color: 'var(--text)',
            }}
          />
        ) : (
          <span style={{ color: selected ? 'var(--text)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selected ? selected.label : placeholder}
          </span>
        )}
        <span style={{ marginLeft: 6, flexShrink: 0 }}>
          {value && !open ? (
            <span
              onClick={handleClear}
              style={{ color: 'var(--text-muted)', fontSize: 15, lineHeight: 1, cursor: 'pointer' }}
            >
              ×
            </span>
          ) : (
            <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{open ? '▲' : '▼'}</span>
          )}
        </span>
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'white', border: '1px solid var(--border)', borderRadius: 6,
          boxShadow: 'var(--shadow-md)', zIndex: 200, maxHeight: 220, overflowY: 'auto',
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: 13 }}>No results</div>
          ) : (
            filtered.map((o) => (
              <div
                key={o.value}
                onMouseDown={() => handleSelect(o.value)}
                style={{
                  padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                  background: o.value === value ? 'var(--primary-light)' : 'white',
                  color: o.value === value ? 'var(--primary-dark)' : 'var(--text)',
                  fontWeight: o.value === value ? 600 : 400,
                }}
                onMouseEnter={(e) => { if (o.value !== value) e.currentTarget.style.background = '#f8fafc'; }}
                onMouseLeave={(e) => { if (o.value !== value) e.currentTarget.style.background = 'white'; }}
              >
                {o.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
