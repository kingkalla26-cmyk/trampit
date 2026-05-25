import { useState, useEffect, useRef, useMemo } from 'react';

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function AutocompleteInput({ value, onChange, placeholder, cities }) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef();

  const debouncedValue = useDebounce(value, 120);

  const filtered = useMemo(() => {
    const q = debouncedValue.trim();
    if (q.length < 1) return [];
    return cities.filter(c => c.includes(q)).slice(0, 8);
  }, [debouncedValue, cities]);

  useEffect(() => {
    setHighlighted(0);
  }, [value]);

  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleKeyDown(e) {
    if (!open || filtered.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); }
    if (e.key === 'Enter')     { e.preventDefault(); onChange(filtered[highlighted]); setOpen(false); }
    if (e.key === 'Escape')    { setOpen(false); }
  }

  return (
    <div ref={containerRef} style={s.wrap}>
      <input
        style={s.input}
        value={value}
        placeholder={placeholder}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul style={s.dropdown}>
          {filtered.map((city, i) => (
            <li
              key={city}
              style={{ ...s.item, ...(i === highlighted ? s.itemHighlighted : {}) }}
              onMouseEnter={() => setHighlighted(i)}
              onMouseDown={() => { onChange(city); setOpen(false); }}
            >
              📍 {city}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const s = {
  wrap: { position: 'relative', width: '100%' },
  input: {
    background: '#1e2330',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 10,
    padding: '12px 14px',
    color: '#f0f2f7',
    fontSize: 15,
    fontFamily: 'Heebo, sans-serif',
    direction: 'rtl',
    outline: 'none',
    width: '100%',
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    right: 0,
    left: 0,
    background: '#1e2330',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 10,
    listStyle: 'none',
    zIndex: 1000,
    maxHeight: 280,
    overflowY: 'auto',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  },
  item: {
    padding: '11px 14px',
    fontSize: 14,
    color: '#f0f2f7',
    cursor: 'pointer',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    direction: 'rtl',
  },
  itemHighlighted: {
    background: 'rgba(79,158,255,0.12)',
    color: '#4f9eff',
  },
};
