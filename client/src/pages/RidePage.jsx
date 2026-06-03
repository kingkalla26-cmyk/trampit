import { useState, useEffect, useRef, useCallback } from 'react';
import Layout from '../components/Layout.jsx';

const DECISION_STYLES = {
  get_off_now:   { bg: '#fef2f2', border: '#fca5a5', icon: '🚨', label: 'רד עכשיו!',   color: '#dc2626' },
  get_off_later: { bg: '#fffbeb', border: '#fcd34d', icon: '⚠️', label: 'רד בהמשך',    color: '#d97706' },
  continue_ride: { bg: '#f0fdf4', border: '#86efac', icon: '✅', label: 'המשך נסיעה',  color: '#16a34a' },
};

const AUTO_INTERVAL_MS = 30_000; // בדיקה כל 30 שניות

function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch {}
}

export default function RidePage() {
  const [gps,          setGps]         = useState(null);
  const [gpsError,     setGpsError]    = useState(false);
  const [destination,  setDest]        = useState('');
  const [detectedRoad, setDetectedRoad] = useState(0);
  const [roadName,     setRoadName]    = useState('');
  const [roadOverride, setRoadOverride] = useState('');
  const [active,       setActive]      = useState(false);  // מצב נסיעה פעיל
  const [loading,      setLoading]     = useState(false);
  const [result,       setResult]      = useState(null);
  const [error,        setError]       = useState('');
  const [lastCheck,    setLastCheck]   = useState(null);
  const [countdown,    setCountdown]   = useState(0);

  const gpsRef       = useRef(null);
  const intervalRef  = useRef(null);
  const countdownRef = useRef(null);
  const prevDecision = useRef(null);

  // ── GPS watchPosition ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) { setGpsError(true); return; }
    const id = navigator.geolocation.watchPosition(
      pos => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGps(loc);
        gpsRef.current = loc;
        setGpsError(false);
      },
      () => setGpsError(true),
      { timeout: 10000, enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // ── זיהוי כביש אוטומטי כשGPS מתעדכן ─────────────────────────────────────
  useEffect(() => {
    if (!gps) return;
    fetch(`/api/nearestRoad?lat=${gps.lat}&lng=${gps.lng}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.road > 0) {
          setDetectedRoad(d.road);
          setRoadName(d.pointName || '');
        }
      })
      .catch(() => {});
  }, [gps?.lat?.toFixed(3), gps?.lng?.toFixed(3)]); // מתעדכן רק כשGPS זז >~100מ

  // ── בדיקת החלטה ───────────────────────────────────────────────────────────
  const check = useCallback(async (loc) => {
    const gpsNow = loc || gpsRef.current;
    if (!gpsNow || !destination.trim()) return;
    setLoading(true);
    setError('');
    try {
      const effectiveRoad = roadOverride ? Number(roadOverride) : detectedRoad;
      const res  = await fetch('/api/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userLat: gpsNow.lat,
          userLng: gpsNow.lng,
          destination: destination.trim(),
          driverNextRoad: effectiveRoad,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'שגיאה'); return; }
      setResult(data);
      setLastCheck(new Date());

      // התראה כשהתוצאה משתנה ל-get_off_now
      if (data.decision === 'get_off_now' && prevDecision.current !== 'get_off_now') {
        vibrate([200, 100, 200, 100, 400]);
      }
      prevDecision.current = data.decision;
    } catch {
      setError('שגיאת חיבור — בודק שוב...');
    } finally {
      setLoading(false);
    }
  }, [destination, detectedRoad, roadOverride]);

  // ── ניהול מצב "נסיעה פעילה" + interval ───────────────────────────────────
  useEffect(() => {
    if (!active) {
      clearInterval(intervalRef.current);
      clearInterval(countdownRef.current);
      setCountdown(0);
      return;
    }

    // בדיקה ראשונה מיידית
    check();

    // countdown ויזואלי
    setCountdown(AUTO_INTERVAL_MS / 1000);
    countdownRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) return AUTO_INTERVAL_MS / 1000;
        return c - 1;
      });
    }, 1000);

    // בדיקה כל 30 שניות
    intervalRef.current = setInterval(() => check(), AUTO_INTERVAL_MS);

    return () => {
      clearInterval(intervalRef.current);
      clearInterval(countdownRef.current);
    };
  }, [active, check]);

  function startRide() {
    if (!destination.trim()) { setError('הכנס יעד נסיעה'); return; }
    if (!gpsRef.current)     { setError('ממתין למיקום GPS — נסה שוב'); return; }
    setError('');
    setResult(null);
    prevDecision.current = null;
    setActive(true);
  }

  function stopRide() {
    setActive(false);
    setResult(null);
    setLastCheck(null);
    prevDecision.current = null;
  }

  const ds            = result ? (DECISION_STYLES[result.decision] || DECISION_STYLES.continue_ride) : null;
  const effectiveRoad = roadOverride ? Number(roadOverride) : detectedRoad;

  return (
    <Layout>
      <div style={s.page}>

        {/* כותרת */}
        <div style={s.intro}>
          <div style={s.introTitle}>🚗 נסיעה פעילה</div>
          <div style={s.introSub}>
            {active
              ? 'מנוע הניווט פעיל — בודק כל 30 שניות'
              : 'הפעל כדי לקבל התראות אוטומטיות בדרך'}
          </div>
        </div>

        {/* GPS status */}
        <div style={{ ...s.gpsRow, borderColor: gpsError ? '#fca5a5' : gps ? '#86efac' : '#fcd34d' }}>
          <span style={{ ...s.gpsDot, background: gpsError ? '#ef4444' : gps ? '#22c55e' : '#f59e0b' }} />
          <span style={s.gpsText}>
            {gpsError ? 'GPS לא זמין — הפעל מיקום' : gps ? 'מיקום חי ✓' : 'מאתר מיקום...'}
          </span>
        </div>

        {/* יעד */}
        <div style={s.field}>
          <label style={s.label}>לאן אתה נוסע? *</label>
          <input
            style={{ ...s.input, opacity: active ? 0.6 : 1 }}
            placeholder="למשל: תל אביב, חיפה, באר שבע"
            value={destination}
            disabled={active}
            onChange={e => { setDest(e.target.value); setResult(null); }}
          />
        </div>

        {/* כביש — זוהה אוטומטי + אפשרות override */}
        <div style={s.roadCard}>
          <div style={s.roadRow}>
            <div style={s.roadDetected}>
              <span style={s.roadLabel}>כביש שזוהה:</span>
              <span style={{ ...s.roadBadge, background: detectedRoad > 0 ? '#dbeafe' : '#f3f4f6', color: detectedRoad > 0 ? '#1d4ed8' : '#9ca3af' }}>
                {detectedRoad > 0 ? `כביש ${detectedRoad}` : 'לא זוהה'}
              </span>
              {roadName && <span style={s.roadName}>ליד {roadName}</span>}
            </div>
          </div>
          <div style={s.roadOverrideRow}>
            <label style={s.label}>עקוף ידני (אופציונלי):</label>
            <input
              style={{ ...s.input, ...s.roadInput }}
              type="number"
              placeholder="מספר כביש..."
              value={roadOverride}
              onChange={e => setRoadOverride(e.target.value)}
            />
          </div>
          {effectiveRoad > 0 && (
            <div style={s.roadActive}>✓ בודק על בסיס כביש {effectiveRoad}</div>
          )}
        </div>

        {error && <div style={s.error}>{error}</div>}

        {/* כפתור הפעלה/עצירה */}
        {!active ? (
          <button style={s.startBtn} onClick={startRide}>
            🟢 התחל ניווט טרמפ
          </button>
        ) : (
          <div style={s.activeControls}>
            <div style={s.countdownBar}>
              <div style={{ ...s.countdownFill, width: `${(countdown / (AUTO_INTERVAL_MS / 1000)) * 100}%` }} />
            </div>
            <div style={s.countdownText}>
              {loading ? '⏳ בודק...' : `בדיקה הבאה בעוד ${countdown} שניות`}
            </div>
            <div style={s.activeRow}>
              <button style={s.checkNowBtn} onClick={() => check()} disabled={loading}>
                🔄 בדוק עכשיו
              </button>
              <button style={s.stopBtn} onClick={stopRide}>
                ⏹ עצור ניווט
              </button>
            </div>
          </div>
        )}

        {/* תוצאת ההחלטה */}
        {ds && (
          <div style={{ ...s.resultCard, background: ds.bg, borderColor: ds.border }}>
            <div style={s.resultIcon}>{ds.icon}</div>
            <div style={{ ...s.resultLabel, color: ds.color }}>{ds.label}</div>
            <div style={s.resultReason}>{result.reason}</div>
            <div style={s.confidence}>
              ביטחון: {result.confidence === 'high' ? 'גבוה ✓' : 'נמוך — שקול בעצמך'}
              {lastCheck && (
                <span style={s.lastCheckTime}>
                  {' · '}עדכון אחרון: {lastCheck.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
            </div>
          </div>
        )}

        {/* נקודות קרובות */}
        {result?.nearbyPoints?.length > 0 && (
          <div style={s.nearbySection}>
            <div style={s.nearbyTitle}>📍 נקודות טרמפ בסביבה</div>
            {result.nearbyPoints.map(pt => (
              <div key={pt.id} style={s.nearbyRow}>
                <div style={s.nearbyLeft}>
                  <div style={s.nearbyName}>{pt.name}</div>
                  {pt.currentRoad > 0 && (
                    <div style={s.nearbyMeta}>כביש {pt.currentRoad}</div>
                  )}
                </div>
                <div style={s.nearbyRight}>
                  <div style={s.nearbyDist}>{pt.distance < 1000 ? `${pt.distance}מ'` : `${(pt.distance / 1000).toFixed(1)}ק"מ`}</div>
                  {pt.activeBusLinesCount > 0 && (
                    <div style={s.nearbyBus}>🚌 {pt.activeBusLinesCount}</div>
                  )}
                  <div style={{ ...s.nearbyDot, background: pt.safetyRating === 'safe' ? '#22c55e' : '#f59e0b' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={s.hint}>
          💡 הנתונים מבוססים על {(3027).toLocaleString()} נקודות מאומתות.
          הכביש מזוהה אוטומטית מה-GPS — תמיד פעל לפי שיקול דעתך.
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

  gpsRow:  { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#ffffff', borderRadius: 10, border: '1.5px solid' },
  gpsDot:  { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  gpsText: { fontSize: 13, color: '#4b5563', fontWeight: 600 },

  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 12, fontWeight: 600, color: '#4b5563' },
  input: { background: '#f1f5f9', border: '1.5px solid transparent', borderRadius: 10, padding: '12px 14px', fontSize: 15, color: '#1f2937', fontFamily: 'Heebo, sans-serif', direction: 'rtl', outline: 'none', boxSizing: 'border-box', width: '100%' },

  roadCard:        { background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 },
  roadRow:         { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  roadDetected:    { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  roadLabel:       { fontSize: 12, color: '#6b7280', fontWeight: 600 },
  roadBadge:       { fontSize: 13, fontWeight: 700, padding: '3px 10px', borderRadius: 20 },
  roadName:        { fontSize: 11, color: '#9ca3af' },
  roadOverrideRow: { display: 'flex', alignItems: 'center', gap: 8 },
  roadInput:       { width: 120, padding: '8px 12px', fontSize: 14 },
  roadActive:      { fontSize: 12, color: '#059669', fontWeight: 600 },

  error: { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13 },

  startBtn: { background: 'linear-gradient(135deg, #16a34a, #22c55e)', border: 'none', borderRadius: 14, padding: 16, color: '#fff', fontSize: 17, fontWeight: 800, cursor: 'pointer', fontFamily: 'Heebo, sans-serif', boxShadow: '0 4px 14px rgba(22,163,74,0.35)' },

  activeControls: { background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 },
  countdownBar:   { height: 4, background: '#e5e7eb', borderRadius: 2, overflow: 'hidden' },
  countdownFill:  { height: '100%', background: 'linear-gradient(90deg, #2563eb, #0ea5e9)', borderRadius: 2, transition: 'width 1s linear' },
  countdownText:  { fontSize: 12, color: '#6b7280', textAlign: 'center' },
  activeRow:      { display: 'flex', gap: 8 },
  checkNowBtn:    { flex: 1, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '10px 0', color: '#15803d', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Heebo, sans-serif' },
  stopBtn:        { flex: 1, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 0', color: '#dc2626', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Heebo, sans-serif' },

  resultCard:   { borderRadius: 14, padding: '22px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center', border: '1.5px solid' },
  resultIcon:   { fontSize: 44 },
  resultLabel:  { fontSize: 24, fontWeight: 800 },
  resultReason: { fontSize: 14, color: '#374151', lineHeight: 1.65, maxWidth: 320 },
  confidence:   { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  lastCheckTime:{ color: '#d1d5db' },

  nearbySection: { background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 14px' },
  nearbyTitle:   { fontSize: 13, fontWeight: 700, color: '#1f2937', marginBottom: 10 },
  nearbyRow:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid #f3f4f6' },
  nearbyLeft:    { flex: 1, minWidth: 0 },
  nearbyName:    { fontSize: 14, fontWeight: 600, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  nearbyMeta:    { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  nearbyRight:   { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  nearbyDist:    { fontSize: 13, fontWeight: 700, color: '#2563eb' },
  nearbyBus:     { fontSize: 11, color: '#059669', background: '#f0fdf4', padding: '2px 6px', borderRadius: 6 },
  nearbyDot:     { width: 8, height: 8, borderRadius: '50%' },

  hint: { fontSize: 12, color: '#9ca3af', textAlign: 'center', lineHeight: 1.6, padding: '0 8px' },
};
