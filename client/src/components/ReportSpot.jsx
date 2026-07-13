import { useState } from 'react';
import { IconPin, IconCheckCircle } from '../icons.jsx';

const DIRECTIONS = ['צפון', 'דרום', 'מזרח', 'מערב', 'צפון-דרום', 'כל הכיוונים'];

export default function ReportSpot({ onClose, onSuccess }) {
  const [form, setForm]       = useState({ name: '', city: '', direction: 'צפון-דרום', bestHours: '', rating: 4, lat: null, lng: null });
  const [loading, setLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [error, setError]     = useState('');
  const [done, setDone]       = useState(false);

  async function useCurrentLocation() {
    if (!navigator.geolocation) { setError('GPS לא זמין במכשיר זה'); return; }
    setGpsLoading(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        try {
          const res  = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`, { credentials: 'include' });
          const data = await res.json();
          setForm(f => ({
            ...f,
            lat,
            lng,
            city: data.city || f.city,
          }));
        } catch {
          // GPS coordinates saved even if geocode fails
          setForm(f => ({ ...f, lat, lng }));
        }
        setGpsLoading(false);
      },
      () => { setError('לא ניתן לקבל מיקום — אפשר הרשאות GPS'); setGpsLoading(false); },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }

  async function handleSubmit() {
    if (!form.name.trim() || !form.city.trim()) { setError('נא למלא שם מיקום ועיר'); return; }
    setLoading(true);
    setError('');
    try {
      const body = { name: form.name, city: form.city, direction: form.direction, bestHours: form.bestHours, rating: Number(form.rating) };
      if (form.lat && form.lng) body.coordinates = { lat: form.lat, lng: form.lng };
      const res  = await fetch('/api/spots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error || 'שגיאה בשמירה'); return; }
      setDone(true);
      setTimeout(() => { onSuccess?.(); onClose?.(); }, 1500);
    } catch {
      setError('שגיאת חיבור — נסה שוב');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.sheet} onClick={e => e.stopPropagation()}>
        <div style={s.handle} />

        {done ? (
          <div style={s.success}>
            <IconCheckCircle size={40} style={{ color: 'var(--accent)' }} />
            <div style={s.successText}>תודה! הדיווח נשמר</div>
          </div>
        ) : (
          <>
            <div style={s.header}>
              <div style={s.title}>
                <IconPin size={17} style={{ color: 'var(--primary)' }} />
                דווח על נקודת טרמפ
              </div>
              <button style={s.closeBtn} onClick={onClose}>✕</button>
            </div>

            {/* כפתור מיקום נוכחי */}
            <button
              style={{ ...s.gpsBtn, opacity: gpsLoading ? 0.6 : 1 }}
              onClick={useCurrentLocation}
              disabled={gpsLoading}
            >
              <IconPin size={15} style={{ color: 'var(--accent)' }} />
              {gpsLoading ? 'מאתר מיקום...' : 'השתמש במיקום הנוכחי'}
            </button>
            {form.lat && (
              <div style={s.gpsConfirm}>
                ✓ מיקום GPS נלכד ({form.lat.toFixed(4)}, {form.lng.toFixed(4)})
              </div>
            )}

            <div style={s.field}>
              <label style={s.label}>שם המקום / צומת *</label>
              <input style={s.input} placeholder="למשל: צומת קסטינה"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>

            <div style={s.field}>
              <label style={s.label}>עיר קרובה *</label>
              <input style={s.input} placeholder="למשל: קריית גת"
                value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
            </div>

            <div style={s.row}>
              <div style={{ ...s.field, flex: 1 }}>
                <label style={s.label}>כיוון</label>
                <select style={s.input} value={form.direction}
                  onChange={e => setForm(f => ({ ...f, direction: e.target.value }))}>
                  {DIRECTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div style={{ ...s.field, flex: 1 }}>
                <label style={s.label}>ציון ({form.rating}/5)</label>
                <input type="range" min="1" max="5" value={form.rating}
                  onChange={e => setForm(f => ({ ...f, rating: Number(e.target.value) }))}
                  style={{ width: '100%', marginTop: 10 }} />
              </div>
            </div>

            <div style={s.field}>
              <label style={s.label}>שעות טובות (אופציונלי)</label>
              <input style={s.input} placeholder="למשל: בוקר 07-10, אחה״צ 15-18"
                value={form.bestHours} onChange={e => setForm(f => ({ ...f, bestHours: e.target.value }))} />
            </div>

            {error && <div style={s.error}>{error}</div>}

            <button style={{ ...s.submitBtn, opacity: loading ? 0.6 : 1 }} onClick={handleSubmit} disabled={loading}>
              {loading ? 'שומר...' : 'שלח דיווח'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const s = {
  overlay:    { position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
  sheet:      { background: 'var(--card)', borderRadius: '20px 20px 0 0', padding: '12px 20px 32px', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', direction: 'rtl' },
  handle:     { width: 40, height: 4, background: 'var(--border)', borderRadius: 2, margin: '0 auto 16px' },
  header:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title:      { fontFamily: 'var(--font-heading)', fontSize: 16.5, fontWeight: 700, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: 8 },
  closeBtn:   { background: 'none', border: 'none', fontSize: 18, color: 'var(--muted-foreground)', cursor: 'pointer' },
  gpsBtn:     { width: '100%', background: 'rgba(var(--accent-rgb),0.08)', border: '1.5px solid rgba(var(--accent-rgb),0.35)', borderRadius: 10, padding: '11px 14px', fontSize: 14, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'var(--font-body)', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 },
  gpsConfirm: { fontSize: 12, color: 'var(--accent)', background: 'rgba(var(--accent-rgb),0.08)', borderRadius: 8, padding: '6px 10px', marginBottom: 12 },
  field:      { marginBottom: 14 },
  row:        { display: 'flex', gap: 12 },
  label:      { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: 6 },
  input:      { width: '100%', background: 'var(--muted)', border: '1.5px solid transparent', borderRadius: 10, padding: '11px 14px', fontSize: 15, color: 'var(--foreground)', fontFamily: 'var(--font-body)', direction: 'rtl', outline: 'none' },
  error:      { background: 'rgba(var(--destructive-rgb),0.06)', border: '1px solid rgba(var(--destructive-rgb),0.25)', borderRadius: 8, padding: '10px 14px', color: 'var(--destructive)', fontSize: 13, marginBottom: 12 },
  submitBtn:  { width: '100%', background: 'var(--primary)', border: 'none', borderRadius: 12, padding: 14, color: 'var(--primary-foreground)', fontSize: 15.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-heading)' },
  success:    { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '32px 0' },
  successText:{ fontSize: 17, fontWeight: 700, color: 'var(--accent)' },
};
