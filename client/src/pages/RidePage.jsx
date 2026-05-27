import { useState, useEffect } from 'react';
import Layout from '../components/Layout.jsx';

const DECISION_STYLES = {
  get_off_now:   { bg: '#fef2f2', border: '#fca5a5', icon: '🚨', label: 'רד עכשיו!',    color: '#dc2626' },
  get_off_later: { bg: '#fffbeb', border: '#fcd34d', icon: '⚠️', label: 'רד בהמשך',     color: '#d97706' },
  continue_ride: { bg: '#f0fdf4', border: '#86efac', icon: '✅', label: 'המשך נסיעה',   color: '#16a34a' },
};

export default function RidePage() {
  const [gps, setGps]             = useState(null);
  const [gpsError, setGpsError]   = useState(false);
  const [destination, setDest]    = useState('');
  const [driverRoad, setRoad]     = useState('');
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState(null);
  const [error, setError]         = useState('');

  useEffect(() => {
    if (!navigator.geolocation) { setGpsError(true); return; }
    const watchId = navigator.geolocation.watchPosition(
      pos => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      ()  => setGpsError(true),
      { timeout: 10000, enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  async function handleCheck() {
    if (!destination.trim()) { setError('הכנס יעד נסיעה'); return; }
    if (!gps)                { setError('ממתין למיקום GPS — נסה שוב'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const res  = await fetch('/api/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userLat: gps.lat,
          userLng: gps.lng,
          destination: destination.trim(),
          driverNextRoad: driverRoad ? Number(driverRoad) : 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'שגיאה'); return; }
      setResult(data);
    } catch {
      setError('שגיאת חיבור — נסה שוב');
    } finally {
      setLoading(false);
    }
  }

  const ds = result ? (DECISION_STYLES[result.decision] || DECISION_STYLES.continue_ride) : null;

  return (
    <Layout>
      <div style={s.page}>
        <div style={s.intro}>
          <div style={s.introTitle}>🚗 נסיעה פעילה</div>
          <div style={s.introSub}>אתה בטרמפ עכשיו? בדוק האם כדאי לרדת בצומת הבא</div>
        </div>

        <div style={{ ...s.gpsRow, borderColor: gpsError ? '#fca5a5' : gps ? '#86efac' : '#fcd34d' }}>
          <span style={{ ...s.gpsDot, background: gpsError ? '#ef4444' : gps ? '#22c55e' : '#f59e0b' }} />
          <span style={s.gpsText}>
            {gpsError ? 'GPS לא זמין — הפעל מיקום' : gps ? `מיקום חי ✓` : 'מאתר מיקום...'}
          </span>
        </div>

        <div style={s.field}>
          <label style={s.label}>לאן אתה נוסע? *</label>
          <input
            style={s.input}
            placeholder="למשל: תל אביב, חיפה, באר שבע"
            value={destination}
            onChange={e => { setDest(e.target.value); setResult(null); }}
          />
        </div>

        <div style={s.field}>
          <label style={s.label}>מספר הכביש הבא של הנהג (אופציונלי)</label>
          <input
            style={s.input}
            placeholder="למשל: 1, 3, 6, 40"
            type="number"
            value={driverRoad}
            onChange={e => { setRoad(e.target.value); setResult(null); }}
          />
        </div>

        {error && <div style={s.error}>{error}</div>}

        <button style={{ ...s.btn, opacity: loading ? 0.6 : 1 }} onClick={handleCheck} disabled={loading}>
          {loading ? 'בודק...' : '🔍 בדוק האם לרדת'}
        </button>

        {ds && (
          <div style={{ ...s.resultCard, background: ds.bg, borderColor: ds.border }}>
            <div style={s.resultIcon}>{ds.icon}</div>
            <div style={{ ...s.resultLabel, color: ds.color }}>{ds.label}</div>
            <div style={s.resultReason}>{result.reason}</div>
            <div style={s.confidence}>
              ביטחון: {result.confidence === 'high' ? 'גבוה' : 'נמוך'}
            </div>
          </div>
        )}

        <div style={s.hint}>
          💡 הנתונים מבוססים על נקודות מאומתות בלבד. תמיד פעל לפי שיקול דעתך.
        </div>
      </div>
    </Layout>
  );
}

const s = {
  page:         { padding: '16px 16px 80px', display: 'flex', flexDirection: 'column', gap: 14 },
  intro:        { background: '#ffffff', borderRadius: 12, padding: '14px 16px', border: '1px solid #e5e7eb' },
  introTitle:   { fontSize: 17, fontWeight: 700, color: '#1f2937', marginBottom: 4 },
  introSub:     { fontSize: 13, color: '#6b7280', lineHeight: 1.5 },
  gpsRow:       { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#ffffff', borderRadius: 10, border: '1.5px solid' },
  gpsDot:       { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  gpsText:      { fontSize: 13, color: '#4b5563', fontWeight: 600 },
  field:        { display: 'flex', flexDirection: 'column', gap: 6 },
  label:        { fontSize: 12, fontWeight: 600, color: '#4b5563' },
  input:        { background: '#f1f5f9', border: '1.5px solid transparent', borderRadius: 10, padding: '12px 14px', fontSize: 15, color: '#1f2937', fontFamily: 'Heebo, sans-serif', direction: 'rtl', outline: 'none', boxSizing: 'border-box', width: '100%' },
  error:        { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13 },
  btn:          { background: 'linear-gradient(135deg, #2563eb, #0ea5e9)', border: 'none', borderRadius: 12, padding: 14, color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'Heebo, sans-serif' },
  resultCard:   { borderRadius: 14, padding: '22px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center', border: '1.5px solid' },
  resultIcon:   { fontSize: 40 },
  resultLabel:  { fontSize: 22, fontWeight: 800 },
  resultReason: { fontSize: 14, color: '#374151', lineHeight: 1.65, maxWidth: 320 },
  confidence:   { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  hint:         { fontSize: 12, color: '#9ca3af', textAlign: 'center', lineHeight: 1.5, padding: '0 8px' },
};
