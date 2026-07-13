import { useState, useEffect, useRef, useMemo } from 'react';
import { IconPin, IconClock } from '../icons.jsx';

// ציונים לפי גודל עיר / חשיבות תחבורתית — שאר הערים מקבלות 1
const W = {
  "תל אביב-יפו":100,"ירושלים":100,"חיפה":95,"באר שבע":90,
  "פתח תקווה":75,"ראשון לציון":75,"נתניה":70,"אשדוד":70,
  "אשקלון":65,"בני ברק":65,"רחובות":62,"בת ים":60,
  "רמת גן":58,"חולון":55,"הרצליה":55,"כפר סבא":52,
  "מודיעין":50,"מודיעין עילית":48,"ראש העין":48,"לוד":45,
  "רמלה":45,"נהריה":44,"עכו":43,"טבריה":42,"ירוחם":40,
  "קריית גת":38,"קריית שמונה":37,"דימונה":36,"ערד":35,
  "אופקים":34,"שדרות":33,"נתיבות":32,"קריית מוצקין":32,
  "קריית ביאליק":31,"קריית ים":30,"קריית אתא":30,
  "קריית מלאכי":28,"מגדל העמק":27,"עפולה":27,"בית שמש":26,
  "מעלות-תרשיחא":25,"צפת":25,"קצרין":24,"יבנה":23,
  "ריינה":20,"סח'נין":20,"טירת כרמל":20,"קריית אונו":20,
};

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
    return data.address || data.city || null;
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
    return cities
      .filter(c => c.includes(q))
      .sort((a, b) => {
        // prefix match קודם, אחר כך לפי משקל פופולריות, אחר כך אלפבית
        const aScore = (a.startsWith(q) ? 10000 : 0) + (W[a] || 1);
        const bScore = (b.startsWith(q) ? 10000 : 0) + (W[b] || 1);
        return bScore - aScore || a.localeCompare(b, 'he');
      })
      .slice(0, 8);
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

    let watchId = null;
    let best = null;
    const done = async (pos) => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = -1;
      console.log('[GPS] using fix acc=', Math.round(pos.coords.accuracy), 'm', pos.coords.latitude, pos.coords.longitude);
      const address = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
      console.log('[GPS] address result=', address);
      if (address) onChange(address);
      setLocLoading(false);
    };

    // Wait up to 20s for a fix ≤20m; use best available on timeout
    const timer = setTimeout(() => {
      if (watchId !== null && watchId !== -1) {
        navigator.geolocation.clearWatch(watchId);
        watchId = -1;
        console.log('[GPS] timeout — best acc=', best ? Math.round(best.coords.accuracy) : 'none');
        if (best) done(best); else setLocLoading(false);
      }
    }, 20000);

    watchId = navigator.geolocation.watchPosition(
      pos => {
        console.log('[GPS] fix acc=', Math.round(pos.coords.accuracy), 'm');
        best = pos;
        if (pos.coords.accuracy <= 20) { clearTimeout(timer); done(pos); }
      },
      (err) => { console.log('[GPS] error', err.code, err.message); clearTimeout(timer); setLocLoading(false); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
  }

  const showDropdown = open && (filtered.length > 0 || (showLocationBtn && value.length === 0));

  return (
    <div ref={containerRef} style={s.wrap}>
      <div style={s.inputWrap}>
        <input
          style={{ ...s.input, ...(showLocationBtn ? s.inputWithBtn : {}) }}
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
            <IconPin size={17} />
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
              {locLoading
                ? <><IconClock size={14} /> מאתר מיקום...</>
                : <><IconPin size={14} /> השתמש במיקום הנוכחי</>}
            </li>
          )}
          {filtered.map((city, i) => (
            <li
              key={city}
              style={{ ...s.item, ...(i === highlighted ? s.itemHighlighted : {}) }}
              onPointerEnter={() => setHighlighted(i)}
              onPointerDown={e => { e.preventDefault(); onChange(city); setOpen(false); }}
            >
              <IconPin size={13} style={{ color: 'var(--muted-foreground)' }} /> {city}
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
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '12px 14px',
    color: 'var(--foreground)',
    fontSize: 15,
    fontFamily: 'var(--font-body)',
    direction: 'rtl',
    outline: 'none',
    width: '100%',
  },
  // בכיוון RTL הטקסט מתחיל מימין ומתמלא שמאלה — צריך רווח שמור בצד שמאל
  // (איפה שיושב כפתור המיקום) כדי שטקסט ארוך (כתובת GPS) לא ייכנס מתחתיו
  inputWithBtn: { padding: '12px 14px 12px 44px' },
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
    background: 'var(--card)',
    border: '1px solid var(--border)',
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
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '13px 14px',
    fontSize: 15,
    color: 'var(--foreground)',
    cursor: 'pointer',
    borderBottom: '1px solid var(--muted)',
    direction: 'rtl',
    touchAction: 'manipulation',
  },
  locItem: {
    color: 'var(--primary)',
    fontWeight: 600,
    background: 'rgba(var(--primary-rgb),0.05)',
  },
  itemHighlighted: {
    background: 'rgba(var(--primary-rgb),0.08)',
    color: 'var(--primary)',
  },
};
