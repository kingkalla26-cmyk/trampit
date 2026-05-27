import { useState } from 'react';

const DIRECTIONS = ['צפון', 'דרום', 'מזרח', 'מערב', 'צפון-דרום', 'כל הכיוונים'];

export default function ReportSpot({ onClose, onSuccess }) {
  const [form, setForm]     = useState({ name: '', city: '', direction: 'צפון-דרום', bestHours: '', rating: 4 });
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [done, setDone]     = useState(false);

  async function handleSubmit() {
    if (!form.name.trim() || !form.city.trim()) { setError('נא למלא שם מיקום ועיר'); return; }
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/spots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...form, rating: Number(form.rating) }),
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
            <div style={{ fontSize: 40 }}>✅</div>
            <div style={s.successText}>תודה! הדיווח נשמר</div>
          </div>
        ) : (
          <>
            <div style={s.header}>
              <div style={s.title}>📍 דווח על נקודת טרמפ</div>
              <button style={s.closeBtn} onClick={onClose}>✕</button>
            </div>

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
  overlay:     { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
  sheet:       { background: '#ffffff', borderRadius: '20px 20px 0 0', padding: '12px 20px 32px', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', direction: 'rtl' },
  handle:      { width: 40, height: 4, background: '#e5e7eb', borderRadius: 2, margin: '0 auto 16px' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  title:       { fontSize: 17, fontWeight: 700, color: '#1f2937' },
  closeBtn:    { background: 'none', border: 'none', fontSize: 18, color: '#9ca3af', cursor: 'pointer' },
  field:       { marginBottom: 14 },
  row:         { display: 'flex', gap: 12 },
  label:       { display: 'block', fontSize: 12, fontWeight: 600, color: '#4b5563', marginBottom: 6 },
  input:       { width: '100%', background: '#f1f5f9', border: '1.5px solid transparent', borderRadius: 10, padding: '11px 14px', fontSize: 15, color: '#1f2937', fontFamily: 'Heebo, sans-serif', direction: 'rtl', outline: 'none' },
  error:       { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 12 },
  submitBtn:   { width: '100%', background: 'linear-gradient(135deg, #2563eb, #0ea5e9)', border: 'none', borderRadius: 12, padding: 14, color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'Heebo, sans-serif' },
  success:     { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '32px 0' },
  successText: { fontSize: 17, fontWeight: 700, color: '#059669' },
};
