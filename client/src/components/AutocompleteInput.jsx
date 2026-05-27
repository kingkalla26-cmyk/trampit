import { useState, useEffect, useRef, useMemo } from 'react';

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

async function reverseGeocode(lat, lng) {
  try {
    const res  = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`, { credentials: 'include' });
    const data = await res.json();
    return data.city || null;
  } catch {
    return null;
  }
}

export default function AutocompleteInput({ value, onChange, placeholder, cities, showLocationBtn = false }) {
  const [open,        setOpen]        = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [locLoading,  setLocLoading]  = useState(false);
  const containerRef = useRef();

  const debouncedValue = useDebounce(value, 120);

  const filtered = useMemo(() => {
    const q = debouncedValue.trim();
    if (q.length < 1) return [];
    return cities.filter(c => c.includes(q)).slice(0, 8);
  }, [debouncedValue, cities]);

  useEffect(() => { setHighlighted(0); }, [value]);

  useEffect(() => {
    function handleOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', handleOutside);
    return () => document.removeEventListener('pointerdown', handleOutside);
  }, []);

  function handleKeyDown(e) {
    if (!open || filtered.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); }
    if (e.key === 'Enter')     { e.preventDefault(); onChange(filtered[highlighted]); setOpen(false); }
    if (e.key === 'Escape')    { setOpen(false); }
  }

  async function handleLocationClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!navigator.geolocation) return;
    setLocLoading(true);
    setOpen(false);
    navigator.geolocation.getCurrentPosition(async pos => {
      const city = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
      if (city) {
        const match = cities.find(c => c.includes(city) || city.includes(c)) || city;
        onChange(match);
      }
      setLocLoading(false);
    }, () => setLocLoading(false), { timeout: 8000, enableHighAccuracy: true });
  }

  const showDropdown = open && (filtered.length > 0 || (showLocationBtn && value.length === 0));

  return (
    <div ref={containerRef} style={s.wrap}>
      <div style={s.inputWrap}>
        <input
          style={s.input}
          value={locLoading ? 'מאתר מיקום...' : value}
          placeholder={placeholder}
          onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          readOnly={locLoading}
        />
        {showLocationBtn && (
          <button
            style={{ ...s.locBtn, opacity: locLoading ? 0.5 : 1 }}
            onPointerDown={handleLocationClick}
            type="button"
            title="מיקום נוכחי"
          >
            📍
          </button>
        )}
      </div>

      {showDropdown && (
        <ul style={s.dropdown}>
          {showLocationBtn && value.length === 0 && (
            <li
              style={{ ...s.item, ...s.locItem }}
              onPointerDown={handleLocationClick}
            >
              {locLoading ? '⏳ מאתר מיקום...' : '📍 השתמש במיקום הנוכחי'}
            </li>
          )}
          {filtered.map((city, i) => (
            <li
              key={city}
              style={{ ...s.item, ...(i === highlighted ? s.itemHighlighted : {}) }}
              onPointerEnter={() => setHighlighted(i)}
              onPointerDown={e => { e.preventDefault(); onChange(city); setOpen(false); }}
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
  wrap:     { position: 'relative', width: '100%' },
  inputWrap:{ position: 'relative', display: 'flex', alignItems: 'center' },
  input: {
    background: '#ffffff',
    border: '1px solid #d1d5db',
    borderRadius: 10,
    padding: '12px 44px 12px 14px',
    color: '#1f2937',
    fontSize: 15,
    fontFamily: 'Heebo, sans-serif',
    direction: 'rtl',
    outline: 'none',
    width: '100%',
  },
  locBtn: {
    position: 'absolute',
    left: 10,
    background: 'none',
    border: 'none',
    fontSize: 18,
    cursor: 'pointer',
    padding: '4px',
    lineHeight: 1,
    touchAction: 'manipulation',
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    right: 0,
    left: 0,
    background: '#ffffff',
    border: '1px solid #d1d5db',
    borderRadius: 10,
    listStyle: 'none',
    margin: 0,
    padding: 0,
    zIndex: 1000,
    maxHeight: 280,
    overflowY: 'auto',
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
  },
  item: {
    padding: '13px 14px',
    fontSize: 15,
    color: '#1f2937',
    cursor: 'pointer',
    borderBottom: '1px solid #f3f4f6',
    direction: 'rtl',
    touchAction: 'manipulation',
  },
  locItem: {
    color: '#2563eb',
    fontWeight: 600,
    background: 'rgba(37,99,235,0.04)',
  },
  itemHighlighted: {
    background: 'rgba(37,99,235,0.08)',
    color: '#2563eb',
  },
};
