import { useEffect, useRef, useState } from 'react';
import { useProximityAlert } from '../hooks/useProximityAlert.js';
import {
  IconCar, IconBus, IconTrain, IconPin, IconStar,
  IconClock, IconThumbUp, IconThumbDown,
  IconTarget, IconStopCircle, IconFlag,
  IconChevronDown, IconChevronUp, IconRefresh,
} from '../icons.jsx';

function israelNow() {
  return new Date().toLocaleTimeString('he-IL', {
    timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function minutesUntil(timeStr) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const [h, m] = timeStr.split(':').map(Number);
  const dep = new Date(now);
  dep.setHours(h, m, 0, 0);
  if (dep < now) return null;
  const diff = Math.round((dep - now) / 60000);
  if (diff <= 1) return 'עכשיו';
  if (diff < 60) return `${diff} ד'`;
  return `${Math.floor(diff / 60)}:${String(diff % 60).padStart(2, '0')} ש'`;
}

function isRouteTowardDest(route, destination) {
  if (!route.to || !destination) return false;
  const d = destination.toLowerCase().trim();
  const t = route.to.toLowerCase().trim();
  return t.includes(d) || d.includes(t);
}

// ── כפתורי הצבעה ────────────────────────────────────────────────────────────
function VoteButtons({ voteKey }) {
  const [counts,  setCounts]  = useState(null);
  const [myVote,  setMyVote]  = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/vote?keys=${encodeURIComponent(voteKey)}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : {})
      .then(d => d[voteKey] && setCounts(d[voteKey]))
      .catch(() => {});
  }, [voteKey]);

  async function vote(v) {
    if (myVote || loading) return;
    setLoading(true);
    try {
      const r = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key: voteKey, vote: v }),
      });
      const d = await r.json();
      if (r.ok || r.status === 409) {
        setCounts({ up: d.up, down: d.down });
        setMyVote(v);
      }
    } catch {}
    finally { setLoading(false); }
  }

  return (
    <div style={v.wrap}>
      <button
        style={{ ...v.btn, ...(myVote === 'up' ? v.btnUp : {}) }}
        onClick={() => vote('up')}
        disabled={!!myVote || loading}
        title="נקודה טובה"
      >
        <IconThumbUp size={14} />
        {counts?.up ?? ''}
      </button>
      <button
        style={{ ...v.btn, ...(myVote === 'down' ? v.btnDown : {}) }}
        onClick={() => vote('down')}
        disabled={!!myVote || loading}
        title="נקודה גרועה"
      >
        <IconThumbDown size={14} />
        {counts?.down ?? ''}
      </button>
      {!myVote && <span style={v.hint}>דרג נקודה זו</span>}
      {myVote  && <span style={{ ...v.hint, color: 'var(--accent)' }}>תודה!</span>}
    </div>
  );
}

export default function Results({ data, origin, destination, carDest, onReset, routeDistKm, totalOnRoute }) {
  const [transit,       setTransit]       = useState(null);
  const [transitLoad,   setTransitLoad]   = useState(false);
  const [transitOpen,   setTransitOpen]   = useState(true);
  const [optTransits,   setOptTransits]   = useState({});
  const [openBusPanels, setOpenBusPanels] = useState({});
  const [clock,         setClock]         = useState(israelNow());
  const clockRef = useRef(null);

  const exitPoints = data?.options || [];
  const { isTracking, alert, geoError, startTracking, stopTracking, dismissAlert, distTo } =
    useProximityAlert(exitPoints);

  useEffect(() => {
    clockRef.current = setInterval(() => setClock(israelNow()), 30000);
    return () => clearInterval(clockRef.current);
  }, []);

  useEffect(() => {
    if (!destination) return;
    setTransitLoad(true);
    fetch(`/api/transit?stop=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => setTransit(d))
      .catch(() => setTransit(null))
      .finally(() => setTransitLoad(false));
  }, [origin, destination]);

  useEffect(() => {
    if (!destination || !data?.options?.length) return;
    const locs = [...new Set(data.options.map(o => o.location).filter(Boolean))];
    locs.forEach(loc => {
      const opt = data.options.find(o => o.location === loc);
      const coordsParam = opt?.coordinates
        ? `&lat=${opt.coordinates.lat}&lng=${opt.coordinates.lng}`
        : '';
      fetch(`/api/transit?stop=${encodeURIComponent(loc)}${coordsParam}`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(d => setOptTransits(p => ({ ...p, [loc]: d || {} })))
        .catch(() => setOptTransits(p => ({ ...p, [loc]: {} })));
    });
  }, [destination, data]);

  if (!data) return null;

  function toggleBus(loc) {
    setOpenBusPanels(p => ({ ...p, [loc]: !p[loc] }));
  }

  return (
    <div style={s.container}>

      {/* ── התראת קרבה ── */}
      {alert && (
        <div style={al.overlay}>
          <div style={al.box}>
            <div style={al.pulse} />
            <div style={al.iconWrap}>
              <IconPin size={32} style={{ color: 'var(--destructive)' }} />
            </div>
            <div style={al.title}>התכונן לירידה!</div>
            <div style={al.loc}>{alert.location}</div>
            <div style={al.dist}>נמצאת במרחק {alert.distKm} ק"מ מנקודת הירידה</div>
            <button style={al.btn} onClick={dismissAlert}>הבנתי</button>
          </div>
        </div>
      )}

      {/* ── כותרת ── */}
      <div style={s.resultsHeader}>
        <div>
          <div style={s.title}>{origin} ← {destination}</div>
          <div style={s.sub}>
            <IconCar size={13} style={{ flexShrink: 0 }} />
            הרכב נוסע ל{carDest}
          </div>
        </div>
        <div style={s.headerActions}>
          <button
            style={{ ...s.actionBtn, ...(isTracking ? s.actionBtnStop : {}) }}
            onClick={isTracking ? stopTracking : startTracking}
          >
            {isTracking
              ? <><IconStopCircle size={14} /> עצור מעקב</>
              : <><IconTarget size={14} /> עקוב</>
            }
          </button>
          <button style={s.actionBtn} onClick={onReset}>
            <IconRefresh size={14} />
            חיפוש חדש
          </button>
        </div>
      </div>

      {/* שגיאת מיקום */}
      {geoError && <div style={s.geoErr}>{geoError}</div>}

      {/* ── כרטיסי יציאה ── */}
      <div style={s.sectionLabel}>נקודות יציאה מומלצות</div>

      <div style={s.exitList}>
        {(data.options || []).map((opt, i) => {
          const transitData = optTransits[opt.location];
          const routes      = transitData?.routes || [];
          const loaded      = transitData !== undefined;
          const hasRoutes   = routes.length > 0;
          const firstLine   = routes[0]?.line;
          const kmAway      = isTracking ? distTo(opt) : null;
          const isOpen      = openBusPanels[opt.location];

          return (
            <div
              key={i}
              style={{ ...s.exitCard, ...(opt.isGatewayMatch ? s.exitCardGateway : {}) }}
            >
              {/* שם + תגים */}
              <div style={s.exitTop}>
                <div style={s.exitNameRow}>
                  <IconPin
                    size={18}
                    style={{ color: opt.isGatewayMatch ? 'var(--accent)' : 'var(--muted-foreground)', flexShrink: 0 }}
                  />
                  <span style={s.exitName}>{opt.location}</span>
                  {opt.isGatewayMatch && (
                    <span style={s.gatewayBadge}>
                      <IconStar size={11} />
                      שער ליעדך
                    </span>
                  )}
                </div>
                {kmAway !== null && (
                  <span style={{ ...s.distBadge, ...(kmAway <= 1.5 ? s.distBadgeClose : {}) }}>
                    {kmAway < 1 ? `${Math.round(kmAway * 1000)} מ'` : `${Math.round(kmAway * 10) / 10} ק"מ`}
                  </span>
                )}
              </div>

              {/* ציר זמן */}
              <div style={s.journey}>
                <div style={s.journeyStep}>
                  <IconCar size={13} />
                  טרמפ
                </div>
                <span style={s.journeyArrow}>→</span>
                <div style={s.journeyStep}>
                  <IconBus size={13} />
                  {firstLine ? `קו ${firstLine}` : 'אוטובוס'}
                </div>
                <span style={s.journeyArrow}>→</span>
                <div style={{ ...s.journeyStep, ...s.journeyDest }}>
                  <IconFlag size={13} />
                  {destination}
                </div>
              </div>

              {/* badges — קווים */}
              <div style={s.linesRow}>
                {!loaded && <span style={s.linesLabel}>טוען...</span>}
                {loaded && !hasRoutes && <span style={s.linesNone}>אין קווים</span>}
                {loaded && routes.map((r, j) => {
                  const relevant = isRouteTowardDest(r, destination);
                  return (
                    <span
                      key={j}
                      style={{ ...s.linePill, ...(relevant ? s.linePillMatch : {}) }}
                      title={`${r.from} → ${r.to}`}
                    >
                      {r.line}{relevant ? ' ✓' : ''}
                    </span>
                  );
                })}
              </div>

              {/* כפתור לוח זמנים */}
              {loaded && hasRoutes && (
                <button style={s.scheduleBtn} onClick={() => toggleBus(opt.location)}>
                  <IconClock size={14} />
                  לוח זמנים
                  {isOpen ? <IconChevronUp size={13} /> : <IconChevronDown size={13} />}
                </button>
              )}

              {/* פאנל קווים */}
              {isOpen && (
                <div style={s.busPanel}>
                  {routes.map((r, j) => {
                    const relevant = isRouteTowardDest(r, destination);
                    const isTrain  = r.type === 'רכבת';
                    return (
                      <div key={j} style={{ ...s.busRow, ...(relevant ? s.busRowMatch : {}) }}>
                        <div style={s.busRowTop}>
                          <span style={{ ...s.lineNum, ...(relevant ? s.lineNumMatch : {}), ...(isTrain ? s.lineNumTrain : {}) }}>
                            {r.line}
                          </span>
                          <div style={s.busInfo}>
                            <div style={{ ...s.busDest, ...(relevant ? s.busDestMatch : {}) }}>
                              {r.from} → {r.to}
                              {relevant && <span style={s.matchTag}>לכיוון שלך</span>}
                            </div>
                            {r.company && <div style={s.busCompany}>{r.company}</div>}
                          </div>
                        </div>
                        <div style={s.deps}>
                          {r.departures.slice(0, 4).map(t => {
                            const min = minutesUntil(t);
                            return (
                              <span key={t} style={{ ...s.depChip, ...(relevant ? s.depChipMatch : {}) }}>
                                {t}{min ? ` · ${min}` : ''}
                              </span>
                            );
                          })}
                          {r.departures.length === 0 && <span style={s.noDep}>אין נסיעות בקרוב</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* הצבעות */}
              <VoteButtons voteKey={`exit:${opt.location}`} />
            </div>
          );
        })}
      </div>

      {/* ── תחבורה ציבורית ממוצא ── */}
      <div style={s.transitSection}>
        <button style={s.accordionBtn} onClick={() => setTransitOpen(o => !o)}>
          <div>
            <div style={s.accordionTitle}>
              <IconBus size={15} style={{ flexShrink: 0 }} />
              תחבורה ציבורית אמיתית
            </div>
            <div style={s.accordionSub}>מקור: ממשל פתוח ישראל + עמותת הסדנה</div>
          </div>
          <div style={s.accordionRight}>
            <div style={s.clockBadge}>
              <IconClock size={13} />
              {clock}
            </div>
            {transitOpen ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
          </div>
        </button>

        {transitOpen && (
          <div style={s.accordionContent}>
            {transitLoad && <div style={s.loading}>טוען נתוני תחבורה...</div>}
            {transit && !transitLoad && (
              <>
                {(transit.routes || []).map((r, i) => {
                  const isTrain = r.type === 'רכבת';
                  const deps    = (r.departures || []).slice(0, 5);
                  return (
                    <div key={i} style={s.routeCard}>
                      <div style={s.routeTop}>
                        <div style={{ ...s.lineNum, ...(isTrain ? s.lineNumTrain : {}) }}>
                          {isTrain ? <IconTrain size={13} /> : <IconBus size={13} />}
                          {r.line}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={s.routeName}>{r.from} → {r.to}</div>
                          {r.company && <div style={s.busCompany}>{r.company}</div>}
                        </div>
                      </div>
                      {deps.length > 0 && (
                        <div style={s.depsRow}>
                          {deps.map((t, j) => {
                            const min = minutesUntil(t);
                            return (
                              <div key={j} style={{ ...s.depCard, ...(j === 0 ? s.depCardFirst : {}) }}>
                                <span style={s.depTime}>{t}</span>
                                {min && <span style={s.depMin}>{min}</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {deps.length === 0 && <div style={s.noDep}>אין נסיעות ב-5 השעות הקרובות</div>}
                    </div>
                  );
                })}
                {(transit.routes || []).length === 0 && (
                  <div style={s.loading}>לא נמצאו קווי תחבורה ציבורית ישירים למסלול זה</div>
                )}
              </>
            )}
          </div>
        )}
      </div>

    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = {
  container: { padding: '24px 16px 80px', display: 'flex', flexDirection: 'column', gap: 12 },

  resultsHeader: {
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 16, padding: '16px 20px',
    display: 'flex', alignItems: 'flex-start',
    justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
    boxShadow: '0 2px 8px rgba(28,25,23,0.04)',
  },
  title: {
    fontSize: 16, fontWeight: 900, color: 'var(--foreground)',
    letterSpacing: '-0.01em', lineHeight: 1.2,
  },
  sub: {
    fontSize: 13, color: 'var(--muted-foreground)', marginTop: 4,
    display: 'flex', alignItems: 'center', gap: 6,
  },
  headerActions: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  actionBtn: {
    background: 'none', border: '1.5px solid var(--border)',
    borderRadius: 10, padding: '7px 12px',
    fontSize: 13, fontWeight: 700, color: 'var(--muted-foreground)',
    cursor: 'pointer', fontFamily: 'var(--font-body)',
    display: 'flex', alignItems: 'center', gap: 6,
    transition: 'border-color 0.15s, color 0.15s',
    whiteSpace: 'nowrap',
  },
  actionBtnStop: {
    color: 'var(--destructive)', borderColor: 'rgba(220,38,38,0.4)',
    background: 'rgba(220,38,38,0.06)',
  },

  geoErr: {
    background: 'rgba(var(--destructive-rgb),0.06)', border: '1px solid rgba(var(--destructive-rgb),0.25)',
    borderRadius: 10, padding: '10px 14px',
    fontSize: 13, color: 'var(--destructive)',
  },

  sectionLabel: {
    fontSize: 13, fontWeight: 800, color: 'var(--muted-foreground)',
    letterSpacing: '0.04em', textTransform: 'uppercase',
    padding: '0 2px',
  },

  exitList: { display: 'flex', flexDirection: 'column', gap: 12 },

  exitCard: {
    background: 'var(--card)', border: '1.5px solid var(--border)',
    borderRadius: 16, padding: '20px 24px',
    display: 'flex', flexDirection: 'column', gap: 16,
    boxShadow: '0 2px 8px rgba(28,25,23,0.04)',
  },
  exitCardGateway: {
    border: '2px solid rgba(var(--accent-rgb),0.35)',
    boxShadow: '0 4px 16px rgba(61,122,58,0.07)',
  },

  exitTop:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  exitNameRow:{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  exitName:   {
    fontSize: 22, fontWeight: 900, color: 'var(--foreground)',
    letterSpacing: '-0.02em', lineHeight: 1.1,
  },
  gatewayBadge: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: 11, fontWeight: 700,
    background: 'rgba(var(--accent-rgb),0.08)', color: 'var(--accent)',
    border: '1px solid rgba(var(--accent-rgb),0.35)',
    borderRadius: 999, padding: '3px 10px',
    whiteSpace: 'nowrap',
  },

  distBadge: {
    fontSize: 11, fontWeight: 700,
    color: 'var(--primary)', background: 'rgba(var(--primary-rgb),0.08)',
    border: '1px solid rgba(var(--primary-rgb),0.3)',
    borderRadius: 6, padding: '3px 8px', flexShrink: 0,
  },
  distBadgeClose: {
    color: 'var(--destructive)', background: 'rgba(220,38,38,0.08)',
    border: '1px solid rgba(220,38,38,0.35)',
    animation: 'pulse 1s infinite',
  },

  journey: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  journeyStep: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'var(--background)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '6px 12px',
    fontSize: 13, fontWeight: 600, color: 'var(--muted-foreground)',
  },
  journeyDest: {
    border: '1px solid rgba(var(--accent-rgb),0.35)',
    background: 'rgba(var(--accent-rgb),0.08)', color: 'var(--accent)', fontWeight: 700,
  },
  journeyArrow: { color: 'var(--border)', fontSize: 12, lineHeight: 1 },

  linesRow: { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  linesLabel: { fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)' },
  linesNone:  { fontSize: 12, color: 'var(--muted-foreground)' },
  linePill: {
    fontSize: 13, fontWeight: 700,
    background: 'rgba(29,78,216,0.07)', color: 'var(--primary)',
    border: '1px solid rgba(29,78,216,0.2)',
    borderRadius: 6, padding: '4px 12px',
  },
  linePillMatch: {
    background: 'rgba(var(--accent-rgb),0.08)', color: 'var(--accent)',
    border: '1px solid rgba(var(--accent-rgb),0.35)', fontWeight: 800,
  },

  scheduleBtn: {
    background: 'var(--background)', border: '1.5px solid var(--border)',
    borderRadius: 10, padding: '9px 14px',
    fontSize: 13, fontWeight: 700, color: 'var(--muted-foreground)',
    cursor: 'pointer', fontFamily: 'var(--font-body)',
    display: 'flex', alignItems: 'center', gap: 6,
    transition: 'border-color 0.15s',
    width: '100%', textAlign: 'right',
  },

  busPanel: {
    display: 'flex', flexDirection: 'column', gap: 8,
    borderTop: '1px solid var(--muted)', paddingTop: 12,
  },
  busRow: {
    background: 'var(--background)', border: '1px solid var(--border)',
    borderRadius: 10, padding: '10px 14px',
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  busRowMatch: { background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.35)' },
  busRowTop:  { display: 'flex', alignItems: 'flex-start', gap: 10 },
  busInfo:    { flex: 1 },
  busDest:    { fontSize: 13, fontWeight: 600, color: 'var(--foreground)', lineHeight: 1.4 },
  busDestMatch:{ color: 'var(--accent)', fontWeight: 700 },
  busCompany: { fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 },
  matchTag: {
    marginRight: 8, fontSize: 11, color: 'var(--accent)',
    background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.35)',
    borderRadius: 6, padding: '1px 6px', fontWeight: 700,
  },

  lineNum: {
    fontSize: 12, fontWeight: 800,
    color: 'var(--primary)', background: 'rgba(29,78,216,0.08)',
    border: '1px solid rgba(29,78,216,0.2)',
    borderRadius: 6, padding: '3px 8px',
    display: 'flex', alignItems: 'center', gap: 5,
    flexShrink: 0,
  },
  lineNumMatch: {
    color: 'var(--accent)', background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.35)',
  },
  lineNumTrain: {
    color: 'var(--warning)', background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.25)',
  },

  deps:        { display: 'flex', gap: 6, flexWrap: 'wrap' },
  depChip: {
    fontSize: 12, color: 'var(--foreground)',
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '2px 8px',
  },
  depChipMatch: {
    background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.35)', color: 'var(--accent)', fontWeight: 600,
  },
  noDep: { fontSize: 11, color: 'var(--muted-foreground)' },

  transitSection: { marginTop: 8 },
  accordionBtn: {
    width: '100%',
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 14, padding: '14px 20px',
    cursor: 'pointer',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    textAlign: 'right', gap: 8, fontFamily: 'var(--font-body)',
    boxShadow: '0 2px 8px rgba(28,25,23,0.04)',
  },
  accordionTitle: {
    fontSize: 14, fontWeight: 800, color: 'var(--foreground)',
    display: 'flex', alignItems: 'center', gap: 8,
  },
  accordionSub: { fontSize: 12, color: 'var(--muted-foreground)', marginTop: 3 },
  accordionRight: {
    display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, color: 'var(--muted-foreground)',
  },
  clockBadge: {
    background: 'rgba(var(--primary-rgb),0.08)', border: '1px solid rgba(var(--primary-rgb),0.3)',
    borderRadius: 8, padding: '4px 10px',
    fontSize: 13, fontWeight: 700, color: 'var(--primary)',
    display: 'flex', alignItems: 'center', gap: 5,
  },
  accordionContent: { marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 },
  loading: { color: 'var(--muted-foreground)', fontSize: 13, padding: '8px 4px' },

  routeCard: {
    background: 'var(--background)', border: '1px solid var(--border)',
    borderRadius: 10, padding: '12px 16px',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  routeTop: { display: 'flex', alignItems: 'center', gap: 12 },
  routeName: { fontSize: 14, fontWeight: 600, color: 'var(--foreground)' },
  depsRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  depCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '5px 10px', minWidth: 52,
  },
  depCardFirst: { background: 'rgba(var(--primary-rgb),0.08)', border: '1px solid rgba(var(--primary-rgb),0.3)' },
  depTime: { fontSize: 14, fontWeight: 700, color: 'var(--foreground)' },
  depMin:  { fontSize: 10, color: 'var(--muted-foreground)', marginTop: 1 },
};

const v = {
  wrap: {
    display: 'flex', alignItems: 'center', gap: 8,
    paddingTop: 12, borderTop: '1px solid var(--muted)',
  },
  btn: {
    display: 'flex', alignItems: 'center', gap: 5,
    background: 'var(--background)', border: '1px solid var(--border)',
    borderRadius: 999, padding: '5px 12px',
    fontSize: 13, cursor: 'pointer',
    fontFamily: 'var(--font-body)', color: 'var(--muted-foreground)',
    transition: 'all 0.15s',
  },
  btnUp:   { background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.35)', color: 'var(--accent)', fontWeight: 700 },
  btnDown: { background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.3)', color: 'var(--destructive)', fontWeight: 700 },
  hint:    { fontSize: 11, color: 'var(--muted-foreground)', flex: 1, textAlign: 'left' },
};

const al = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.65)', zIndex: 10000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  box: {
    background: 'var(--card)', borderRadius: 20,
    padding: '32px 28px', maxWidth: 340, width: '100%',
    textAlign: 'center', position: 'relative',
    boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
  },
  pulse: {
    position: 'absolute', top: -10, left: '50%',
    transform: 'translateX(-50%)',
    width: 20, height: 20, borderRadius: '50%',
    background: 'var(--destructive)', boxShadow: '0 0 0 8px rgba(220,38,38,0.2)',
  },
  iconWrap: { marginTop: 8 },
  title: { fontSize: 22, fontWeight: 900, color: 'var(--destructive)' },
  loc:   { fontSize: 18, fontWeight: 800, color: 'var(--foreground)' },
  dist:  { fontSize: 14, color: 'var(--muted-foreground)' },
  btn: {
    marginTop: 8, background: 'var(--destructive)',
    border: 'none', borderRadius: 12,
    padding: '14px 32px', color: 'var(--destructive-foreground)',
    fontSize: 16, fontWeight: 800,
    cursor: 'pointer', fontFamily: 'var(--font-body)', width: '100%',
  },
};
