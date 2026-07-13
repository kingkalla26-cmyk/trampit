import { useState, useEffect, useRef, useCallback } from 'react';
import Layout from '../components/Layout.jsx';
import {
  IconAlertCircle, IconCheckCircle, IconMap, IconSearch, IconClock,
  IconPin, IconBus, IconRefresh, IconStopCircle, IconStar, IconNavigation,
} from '../icons.jsx';

const DECISION_STYLES = {
  get_off_now:   { bg: 'rgba(var(--destructive-rgb),0.06)', border: 'rgba(var(--destructive-rgb),0.35)', Icon: IconAlertCircle, label: 'רד עכשיו!',   color: 'var(--destructive)' },
  get_off_later: { bg: 'rgba(var(--warning-rgb),0.1)', border: 'rgba(var(--warning-rgb),0.5)', Icon: IconAlertCircle, label: 'רד בהמשך',    color: 'var(--warning)' },
  continue_ride: { bg: 'rgba(var(--accent-rgb),0.08)', border: 'rgba(var(--accent-rgb),0.35)', Icon: IconCheckCircle, label: 'המשך נסיעה',  color: 'var(--accent)' },
};

const AUTO_INTERVAL_MS = 30_000;

function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch {}
}

function fmtDist(m) {
  return m < 1000 ? `${m}מ'` : `${(m / 1000).toFixed(1)}ק"מ`;
}

// ── כרטיס נקודת יציאה ─────────────────────────────────────────────────────────
function ExitCard({ pt, rank }) {
  const quality = pt.activeBusLinesCount >= 3 ? 'high'
                : pt.activeBusLinesCount >= 1 ? 'mid'
                : 'low';
  const qColor  = quality === 'high' ? 'var(--accent)' : quality === 'mid' ? 'var(--warning)' : 'var(--muted-foreground)';
  const qLabel  = quality === 'high' ? 'מצוין' : quality === 'mid' ? 'טוב' : 'בסיסי';

  return (
    <div style={{ ...xs.exitCard, ...(rank === 1 ? xs.exitCardBest : {}) }}>
      {rank === 1 && (
        <div style={xs.bestBadge}>
          <IconStar size={11} style={{ color: 'var(--primary-foreground)' }} /> הכי טוב
        </div>
      )}
      <div style={xs.exitTop}>
        <div style={xs.exitName}>{pt.name}</div>
        <div style={{ ...xs.exitQuality, color: qColor }}>{qLabel}</div>
      </div>
      <div style={xs.exitMeta}>
        {pt.currentRoad > 0 && <span style={xs.metaChip}>כביש {pt.currentRoad}</span>}
        <span style={xs.metaChip}><IconPin size={11} style={{ display: 'inline', verticalAlign: '-2px' }} /> {fmtDist(pt.distanceFromUser)}</span>
        {pt.activeBusLinesCount > 0 && (
          <span style={{ ...xs.metaChip, background: 'rgba(var(--accent-rgb),0.08)', color: 'var(--accent)' }}>
            <IconBus size={11} style={{ display: 'inline', verticalAlign: '-2px' }} /> {pt.activeBusLinesCount} קווים
          </span>
        )}
      </div>
      {pt.servedDestinations?.length > 0 && (
        <div style={xs.exitDests}>
          → {pt.servedDestinations.join(' · ')}
        </div>
      )}
    </div>
  );
}

export default function RidePage() {
  // ── Plan state ──────────────────────────────────────────────────────────────
  const [planDest,    setPlanDest]    = useState('');
  const [planLoading, setPlanLoading] = useState(false);
  const [planResults, setPlanResults] = useState(null);
  const [planError,   setPlanError]   = useState('');

  // ── Active ride state ───────────────────────────────────────────────────────
  const [gps,          setGps]         = useState(null);
  const [gpsError,     setGpsError]    = useState(false);
  const [destination,  setDest]        = useState('');
  const [active,       setActive]      = useState(false);
  const [loading,      setLoading]     = useState(false);
  const [result,       setResult]      = useState(null);
  const [error,        setError]       = useState('');
  const [lastCheck,    setLastCheck]   = useState(null);
  const [countdown,    setCountdown]   = useState(0);

  const gpsRef       = useRef(null);
  const intervalRef  = useRef(null);
  const countdownRef = useRef(null);
  const prevDecision = useRef(null);

  // ── GPS ─────────────────────────────────────────────────────────────────────
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

  // ── Plan route ──────────────────────────────────────────────────────────────
  async function planRoute() {
    const loc = gpsRef.current;
    if (!loc)            { setPlanError('ממתין למיקום GPS — נסה שוב בעוד שנייה'); return; }
    if (!planDest.trim()) { setPlanError('הכנס את יעד הנהג'); return; }

    setPlanLoading(true);
    setPlanError('');
    setPlanResults(null);

    try {
      const params = new URLSearchParams({
        userLat: loc.lat,
        userLng: loc.lng,
        dest:    planDest.trim(),
      });
      const res  = await fetch(`/api/route/plan?${params}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) { setPlanError(data.error || 'שגיאה — נסה שוב'); return; }
      if (!data.exitPoints?.length) {
        setPlanError('לא נמצאו נקודות טרמפ לאורך המסלול הזה');
        return;
      }
      setPlanResults(data);
    } catch {
      setPlanError('שגיאת חיבור — בדוק אינטרנט ונסה שוב');
    } finally {
      setPlanLoading(false);
    }
  }

  // ── Active ride check ───────────────────────────────────────────────────────
  const check = useCallback(async (loc) => {
    const gpsNow = loc || gpsRef.current;
    if (!gpsNow || !destination.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userLat: gpsNow.lat, userLng: gpsNow.lng, destination: destination.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'שגיאה'); return; }
      setResult(data);
      setLastCheck(new Date());
      if (data.decision === 'get_off_now' && prevDecision.current !== 'get_off_now') {
        vibrate([200, 100, 200, 100, 400]);
      }
      prevDecision.current = data.decision;
    } catch { setError('שגיאת חיבור — בודק שוב...'); }
    finally  { setLoading(false); }
  }, [destination]);

  useEffect(() => {
    if (!active) { clearInterval(intervalRef.current); clearInterval(countdownRef.current); setCountdown(0); return; }
    check();
    setCountdown(AUTO_INTERVAL_MS / 1000);
    countdownRef.current = setInterval(() => setCountdown(c => c <= 1 ? AUTO_INTERVAL_MS / 1000 : c - 1), 1000);
    intervalRef.current  = setInterval(() => check(), AUTO_INTERVAL_MS);
    return () => { clearInterval(intervalRef.current); clearInterval(countdownRef.current); };
  }, [active, check]);

  function startRide() {
    if (!destination.trim()) { setError('הכנס יעד נסיעה'); return; }
    if (!gpsRef.current)     { setError('ממתין למיקום GPS — נסה שוב'); return; }
    setError(''); setResult(null); prevDecision.current = null; setActive(true);
  }
  function stopRide() { setActive(false); setResult(null); setLastCheck(null); prevDecision.current = null; }

  const ds = result ? (DECISION_STYLES[result.decision] || DECISION_STYLES.continue_ride) : null;

  return (
    <Layout>
      <div style={s.page}>

        {/* GPS status */}
        <div style={{ ...s.gpsRow, ...(gpsError ? s.gpsRowError : gps ? s.gpsRowOk : s.gpsRowPending) }}>
          {gpsError
            ? <IconAlertCircle size={18} style={{ color: 'var(--destructive)' }} />
            : gps
              ? <span className="trampit-pulse-dot" style={s.pulseDot} />
              : <IconClock size={18} style={{ color: 'var(--warning)' }} />
          }
          <span style={{ ...s.gpsText, color: gpsError ? 'var(--destructive)' : gps ? 'var(--accent)' : 'var(--warning-foreground)' }}>
            {gpsError ? 'GPS לא זמין — הפעל מיקום' : gps ? 'מיקום חי' : 'מאתר מיקום...'}
          </span>
        </div>

        {/* ══ SECTION 1: תכנון מסלול ══ */}
        <div style={s.section}>
          <div style={s.sectionTitle}><IconMap size={17} style={{ color: 'var(--primary)' }} /> תכנן יציאה מהרכב</div>
          <div style={s.sectionSub}>הכנס לאן הנהג נוסע — האפליקציה תמצא את נקודות הטרמפ לאורך המסלול</div>

          <div style={s.planRow}>
            <input
              style={s.planInput}
              placeholder="יעד הנהג: למשל תל אביב, חיפה..."
              value={planDest}
              onChange={e => { setPlanDest(e.target.value); setPlanResults(null); setPlanError(''); }}
              onKeyDown={e => e.key === 'Enter' && planRoute()}
            />
            <button
              style={{ ...s.planBtn, opacity: planLoading ? 0.7 : 1 }}
              onClick={planRoute}
              disabled={planLoading}
            >
              {planLoading ? <IconClock size={15} /> : <><IconSearch size={14} /> חשב</>}
            </button>
          </div>

          {planError && <div style={s.planError}>{planError}</div>}

          {planLoading && (
            <div style={s.planLoading}>
              <div style={s.spinner} />
              <span>מחשב מסלול ומחפש נקודות טרמפ...</span>
            </div>
          )}

          {planResults && (
            <div style={s.planResults}>
              <div style={s.planHeader}>
                <span style={s.planHeaderText}>
                  מסלול ל{planResults.destination.name} · {planResults.routeDistKm} ק"מ
                </span>
                <span style={s.planCount}>{planResults.totalFound} נקודות נמצאו</span>
              </div>
              {planResults.exitPoints.map((pt, i) => (
                <ExitCard key={pt.id} pt={pt} rank={i + 1} />
              ))}
              <div style={s.planNote}>
                הנקודות מסודרות לפי סדר הנסיעה — הראשונה היא הקרובה ביותר אליך כעת
              </div>
            </div>
          )}
        </div>

        {/* ══ DIVIDER ══ */}
        <div style={s.divider}><span style={s.dividerText}>ניווט פעיל (בזמן אמת)</span></div>

        {/* ══ SECTION 2: נסיעה פעילה ══ */}
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

        {error && <div style={s.error}>{error}</div>}

        {!active ? (
          <button style={s.startBtn} onClick={startRide}>
            <IconNavigation size={18} /> התחל ניווט פעיל
          </button>
        ) : (
          <div style={s.activeControls}>
            <div style={s.countdownBar}>
              <div style={{ ...s.countdownFill, width: `${(countdown / (AUTO_INTERVAL_MS / 1000)) * 100}%` }} />
            </div>
            <div style={s.countdownText}>{loading ? 'בודק...' : `בדיקה הבאה בעוד ${countdown} שניות`}</div>
            <div style={s.activeRow}>
              <button style={s.checkNowBtn} onClick={() => check()} disabled={loading}><IconRefresh size={14} /> בדוק עכשיו</button>
              <button style={s.stopBtn} onClick={stopRide}><IconStopCircle size={14} /> עצור</button>
            </div>
          </div>
        )}

        {ds && (
          <div style={{ ...s.resultCard, background: ds.bg, borderColor: ds.border }}>
            <ds.Icon size={40} style={{ color: ds.color }} />
            <div style={{ ...s.resultLabel, color: ds.color }}>{ds.label}</div>
            <div style={s.resultReason}>{result.reason}</div>
            <div style={s.confidence}>
              ביטחון: {result.confidence === 'high' ? 'גבוה ✓' : 'נמוך — שקול בעצמך'}
              {lastCheck && <span style={s.lastCheckTime}> · {lastCheck.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
            </div>
          </div>
        )}

      </div>

      <style>{`
        .trampit-pulse-dot::before, .trampit-pulse-dot::after {
          content: ''; position: absolute; inset: 0; border-radius: 50%; background: var(--accent);
        }
        .trampit-pulse-dot::before { animation: trampit-pulse-ring 1.8s ease-out infinite; }
        @keyframes trampit-pulse-ring { 0% { transform: scale(1); opacity: 0.55; } 100% { transform: scale(3.2); opacity: 0; } }
      `}</style>
    </Layout>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = {
  page:    { padding: '16px 16px 80px', display: 'flex', flexDirection: 'column', gap: 14 },

  gpsRow:  { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10, border: '1px solid' },
  gpsRowOk:      { background: 'rgba(var(--accent-rgb),0.08)', borderColor: 'rgba(var(--accent-rgb),0.25)' },
  gpsRowError:   { background: 'rgba(var(--destructive-rgb),0.06)', borderColor: 'rgba(var(--destructive-rgb),0.22)' },
  gpsRowPending: { background: 'rgba(var(--warning-rgb),0.1)', borderColor: 'rgba(var(--warning-rgb),0.3)' },
  pulseDot: { position: 'relative', width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 },
  gpsText: { fontSize: 13, fontWeight: 700 },

  section:     { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px' },
  sectionTitle:{ fontFamily: 'var(--font-heading)', fontSize: 15.5, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 7 },
  sectionSub:  { fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 12, lineHeight: 1.5 },

  planRow:   { display: 'flex', gap: 8 },
  planInput: { flex: 1, background: 'var(--muted)', border: '1.5px solid transparent', borderRadius: 10, padding: '12px 14px', fontSize: 15, color: 'var(--foreground)', fontFamily: 'var(--font-body)', direction: 'rtl', outline: 'none' },
  planBtn:   { background: 'var(--primary)', border: 'none', borderRadius: 10, padding: '0 16px', color: 'var(--primary-foreground)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 },
  planError: { background: 'rgba(var(--destructive-rgb),0.06)', border: '1px solid rgba(var(--destructive-rgb),0.25)', borderRadius: 8, padding: '10px 12px', color: 'var(--destructive)', fontSize: 13, marginTop: 8 },
  planLoading: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', color: 'var(--muted-foreground)', fontSize: 13 },
  spinner:   { width: 18, height: 18, border: '2px solid var(--border)', borderTop: '2px solid var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 },

  planResults:  { marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  planHeader:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  planHeaderText:{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' },
  planCount:    { fontSize: 11, color: 'var(--muted-foreground)', background: 'var(--muted)', padding: '2px 8px', borderRadius: 10 },
  planNote:     { fontSize: 11, color: 'var(--muted-foreground)', textAlign: 'center', marginTop: 4 },

  divider:     { display: 'flex', alignItems: 'center', gap: 10 },
  dividerText: { fontSize: 11, color: 'var(--muted-foreground)', fontWeight: 600, whiteSpace: 'nowrap', background: 'var(--background)', padding: '0 8px' },

  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 12, fontWeight: 600, color: 'var(--muted-foreground)' },
  input: { background: 'var(--muted)', border: '1.5px solid transparent', borderRadius: 10, padding: '12px 14px', fontSize: 15, color: 'var(--foreground)', fontFamily: 'var(--font-body)', direction: 'rtl', outline: 'none', boxSizing: 'border-box', width: '100%' },

  error:    { background: 'rgba(var(--destructive-rgb),0.06)', border: '1px solid rgba(var(--destructive-rgb),0.25)', borderRadius: 8, padding: '10px 14px', color: 'var(--destructive)', fontSize: 13 },
  startBtn: { height: 56, background: 'var(--accent)', border: 'none', borderRadius: 12, padding: '0 16px', color: 'var(--accent-foreground)', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-heading)', boxShadow: 'var(--shadow-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 },

  activeControls: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 },
  countdownBar:   { height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' },
  countdownFill:  { height: '100%', background: 'var(--primary)', borderRadius: 2, transition: 'width 1s linear' },
  countdownText:  { fontSize: 12, color: 'var(--muted-foreground)', textAlign: 'center' },
  activeRow:      { display: 'flex', gap: 8 },
  checkNowBtn:    { flex: 1, background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.35)', borderRadius: 10, padding: '10px 0', color: 'var(--accent)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
  stopBtn:        { flex: 1, background: 'rgba(var(--destructive-rgb),0.06)', border: '1px solid rgba(var(--destructive-rgb),0.25)', borderRadius: 10, padding: '10px 0', color: 'var(--destructive)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 },

  resultCard:   { borderRadius: 14, padding: '22px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center', border: '1.5px solid' },
  resultLabel:  { fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 800 },
  resultReason: { fontSize: 14, color: 'var(--foreground)', lineHeight: 1.65, maxWidth: 320 },
  confidence:   { fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 },
  lastCheckTime:{ color: 'var(--border)' },

};

const xs = {
  exitCard:    { background: 'var(--background)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '12px 14px', position: 'relative' },
  exitCardBest:{ background: 'rgba(var(--primary-rgb),0.08)', border: '1.5px solid rgba(var(--primary-rgb),0.35)' },
  bestBadge:   { position: 'absolute', top: -10, right: 12, background: 'var(--primary)', color: 'var(--primary-foreground)', fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 4 },
  exitTop:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  exitName:    { fontFamily: 'var(--font-heading)', fontSize: 14.5, fontWeight: 700, color: 'var(--foreground)' },
  exitQuality: { fontSize: 12, fontWeight: 700 },
  exitMeta:    { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 },
  metaChip:    { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, background: 'var(--border)', color: 'var(--foreground)', padding: '3px 8px', borderRadius: 8, fontWeight: 600 },
  exitDests:   { fontSize: 12, color: 'var(--primary)', lineHeight: 1.5 },
};
