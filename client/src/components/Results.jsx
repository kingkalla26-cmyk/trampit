import { useEffect, useRef, useState } from 'react';

function israelNow() {
  return new Date().toLocaleTimeString('he-IL', {
    timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function minutesUntil(timeStr) {
  const now  = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const [h, m] = timeStr.split(':').map(Number);
  const dep  = new Date(now);
  dep.setHours(h, m, 0, 0);
  if (dep < now) return null;
  const diff = Math.round((dep - now) / 60000);
  if (diff <= 1) return 'עכשיו';
  if (diff < 60) return `${diff} ד'`;
  return `${Math.floor(diff / 60)}:${String(diff % 60).padStart(2, '0')} ש'`;
}

export default function Results({ data, origin, destination, carDest, onReset }) {
  const [transit, setTransit]               = useState(null);
  const [transitLoading, setTransitLoading] = useState(false);
  const [transitOpen, setTransitOpen]       = useState(true);
  const [optTransits, setOptTransits]       = useState({});
  const [clock, setClock]                   = useState(israelNow());
  const clockRef = useRef(null);

  useEffect(() => {
    clockRef.current = setInterval(() => setClock(israelNow()), 30000);
    return () => clearInterval(clockRef.current);
  }, []);

  useEffect(() => {
    if (!destination) return;
    setTransitLoading(true);
    fetch(`/api/transit?stop=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`, {
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => setTransit(d))
      .catch(() => setTransit(null))
      .finally(() => setTransitLoading(false));
  }, [origin, destination]);

  useEffect(() => {
    if (!destination || !data?.options?.length) return;
    const locations = [...new Set((data.options || []).map(o => o.location).filter(Boolean))];
    locations.forEach(loc => {
      fetch(`/api/transit?stop=${encodeURIComponent(loc)}&destination=${encodeURIComponent(destination)}`, {
        credentials: 'include',
      })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d && (d.routes?.length > 0 || d.stops?.length > 0)) {
            setOptTransits(prev => ({ ...prev, [loc]: d }));
          }
        })
        .catch(() => {});
    });
  }, [destination, data]);

  if (!data) return null;

  const typeConfig = {
    fast:  { label: '⚡ הכי מהיר',     color: '#d97706', borderColor: '#fbbf24' },
    cheap: { label: '₪ הכי זול',       color: '#059669', borderColor: '#10b981' },
    tramp: { label: '🤙 הכי קל לטרמפ', color: '#7c3aed', borderColor: '#a78bfa' },
  };

  return (
    <div style={s.container}>
      <div style={s.card}>
        <div style={s.header}>
          <div>
            <div style={s.title}>{origin} → {destination}</div>
            <div style={s.sub}>הרכב נוסע ל{carDest} — בחר נקודת יציאה:</div>
          </div>
          <span style={s.aiBadge}>✦ AI</span>
          <button style={s.resetBtn} onClick={onReset}>חיפוש חדש</button>
        </div>

        {/* Options */}
        <div style={s.grid}>
          {(data.options || []).map((opt, i) => {
            const cfg       = typeConfig[opt.type] || typeConfig.fast;
            const jrRoutes  = optTransits[opt.location]?.routes || [];
            const firstLine = jrRoutes[0]?.line;

            return (
              <div key={i} style={{
                ...s.optCard,
                ...(opt.best ? s.optBest : {}),
                borderRight: `4px solid ${cfg.borderColor}`,
              }}>
                <span style={{ ...s.badge, background: cfg.color + '18', color: cfg.color, border: `1px solid ${cfg.color}33` }}>
                  {cfg.label}
                </span>

                <div style={s.location}>{opt.location}</div>
                <div style={s.distance}>{opt.exitDistance} מהמוצא</div>

                {/* Timeline */}
                <div style={s.timeline}>
                  <span style={s.tlStep}>🚗 טרמפ</span>
                  <span style={s.tlArrow}>→</span>
                  <span style={s.tlStep}>{firstLine ? `🚌 ${firstLine}` : '🚌 אוטובוס'}</span>
                  <span style={s.tlArrow}>→</span>
                  <span style={{ ...s.tlStep, ...s.tlDest }}>🟢 {destination}</span>
                </div>

                <div style={s.stats}>
                  <div style={s.stat}><div style={s.statVal}>{opt.time}</div><div style={s.statLbl}>זמן</div></div>
                  <div style={s.stat}><div style={s.statVal}>{opt.cost}</div><div style={s.statLbl}>עלות</div></div>
                  <div style={s.stat}><div style={s.statVal}>{opt.trampScore}/10</div><div style={s.statLbl}>טרמפ</div></div>
                </div>

                {/* קווים אמיתיים מהצומת ליעד */}
                {jrRoutes.length > 0 && (
                  <div style={s.jrWrap}>
                    <div style={s.jrTitle}>🚌 קווים מהצומת ל{destination}:</div>
                    {jrRoutes.slice(0, 3).map((r, j) => (
                      <div key={j} style={s.jrRow}>
                        <span style={s.jrLine}>{r.line}</span>
                        <div style={s.jrDeps}>
                          {r.departures.slice(0, 3).map(t => {
                            const min = minutesUntil(t);
                            return (
                              <span key={t} style={s.jrChip}>
                                {t}{min ? ` · ${min}` : ''}
                              </span>
                            );
                          })}
                          {r.departures.length === 0 && <span style={s.jrNone}>אין נסיעות ב-5 ש'</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Real Transit Data — Accordion */}
        <div style={s.section}>
          <button style={s.accordionBtn} onClick={() => setTransitOpen(o => !o)}>
            <div>
              <div style={s.accordionTitle}>🚌 תחבורה ציבורית אמיתית</div>
              <div style={s.accordionSub}>מקור: ממשל פתוח ישראל + עמותת הסדנה</div>
            </div>
            <div style={s.accordionRight}>
              <div style={s.clockBadge}>🕐 {clock}</div>
              <span style={s.accordionArrow}>{transitOpen ? '▲' : '▼'}</span>
            </div>
          </button>

          {transitOpen && (
            <div style={s.accordionContent}>
              {transitLoading && <div style={s.transitLoading}>טוען נתוני תחבורה...</div>}

              {transit && !transitLoading && (
                <>
                  {(transit.routes || []).length > 0 && (
                    <div style={s.routesWrap}>
                      {transit.routes.map((r, i) => {
                        const isTrain = r.type === 'רכבת';
                        const deps    = (r.departures || []).slice(0, 5);
                        return (
                          <div key={i} style={s.routeCard}>
                            <div style={s.routeTop}>
                              <div style={{ ...s.lineNum, background: isTrain ? 'rgba(217,119,6,0.1)' : 'rgba(37,99,235,0.08)', color: isTrain ? '#b45309' : '#2563eb', border: `1px solid ${isTrain ? 'rgba(217,119,6,0.25)' : 'rgba(37,99,235,0.2)'}` }}>
                                {isTrain ? '🚆' : '🚌'} {r.line}
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={s.routeName}>{r.from} → {r.to}</div>
                                {r.company && <div style={s.routeCompany}>{r.company}</div>}
                              </div>
                              <div style={s.routeType}>{r.type}</div>
                            </div>
                            {deps.length > 0 && (
                              <div style={s.depsRow}>
                                {deps.map((t, j) => {
                                  const min = minutesUntil(t);
                                  return (
                                    <div key={j} style={{ ...s.depChip, ...(j === 0 ? s.depChipFirst : {}) }}>
                                      <span style={s.depTime}>{t}</span>
                                      {min && <span style={s.depMin}>{min}</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {deps.length === 0 && (
                              <div style={s.noDepMsg}>אין נסיעות ב-5 השעות הקרובות</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {(transit.stops || []).length > 0 && (
                    <div style={s.stopsWrap}>
                      <div style={s.stopsHeader}>תחנות קרובות ל{origin}:</div>
                      <div style={s.stopsList}>
                        {transit.stops.slice(0, 4).map((st, i) => (
                          <div key={i} style={s.stopItem}>
                            <span style={s.stopDot}>●</span>
                            <span style={s.stopName}>{st.name}</span>
                            {st.city && <span style={s.stopCity}>{st.city}</span>}
                            {st.code && <span style={s.stopCode}>#{st.code}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(transit.routes || []).length === 0 && (transit.stops || []).length === 0 && (
                    <div style={s.noTransit}>לא נמצאו קווי תחבורה ציבורית ישירים למסלול זה</div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Hotspots */}
        {(data.hotspots || []).length > 0 && (
          <div style={s.section}>
            <div style={s.sectionTitle}>🔥 נקודות טרמפ חמות ליד המסלול</div>
            <div style={s.sectionSub}>מבוסס על דיווחי קהילה ונתוני שעות</div>
            {data.hotspots.map((hs, i) => (
              <div key={i} style={s.hotspot}>
                <div style={s.rank}>{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={s.hsName}>{hs.name}</div>
                  <div style={s.hsDetail}>{hs.direction} · פעיל {hs.bestTime}</div>
                </div>
                <div style={s.heat}>{'🔥'.repeat(hs.heat)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  container: { padding: '0 16px 80px' },
  card:      { background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
  header:    { display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  title:     { fontSize: 17, fontWeight: 700, color: '#1f2937' },
  sub:       { fontSize: 13, color: '#4b5563', marginTop: 2 },
  aiBadge:   { fontSize: 11, color: '#2563eb', background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.2)', padding: '3px 10px', borderRadius: 20 },
  resetBtn:  { background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 14px', color: '#1f2937', cursor: 'pointer', fontSize: 13, fontFamily: 'Heebo, sans-serif', marginRight: 'auto' },

  grid:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 },
  optCard: { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 },
  optBest: { border: '1px solid rgba(37,99,235,0.35)', boxShadow: '0 0 0 3px rgba(37,99,235,0.08)' },
  badge:   { fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, alignSelf: 'flex-start' },

  location: { fontSize: 18, fontWeight: 700, color: '#1f2937' },
  distance: { fontSize: 12, color: '#6b7280' },

  timeline: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  tlStep:   { background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '4px 10px', fontSize: 12, color: '#1f2937', fontWeight: 600, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' },
  tlArrow:  { color: '#9ca3af', fontSize: 12, fontWeight: 700 },
  tlDest:   { background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', color: '#059669' },

  stats:   { display: 'flex', gap: 8 },
  stat:    { flex: 1, background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 6px', textAlign: 'center' },
  statVal: { fontSize: 14, fontWeight: 700, color: '#1f2937' },
  statLbl: { fontSize: 10, color: '#6b7280', marginTop: 2 },

  jrWrap:  { borderTop: '1px solid #e5e7eb', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 },
  jrTitle: { fontSize: 11, color: '#6b7280', marginBottom: 4 },
  jrRow:   { display: 'flex', alignItems: 'center', gap: 8 },
  jrLine:  { fontSize: 13, fontWeight: 700, color: '#2563eb', background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: 6, padding: '2px 8px', flexShrink: 0 },
  jrDeps:  { display: 'flex', gap: 4, flexWrap: 'wrap' },
  jrChip:  { fontSize: 12, color: '#1f2937', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, padding: '2px 7px' },
  jrNone:  { fontSize: 11, color: '#9ca3af' },

  section: { marginTop: 20 },
  sectionTitle: { fontSize: 15, fontWeight: 700, color: '#1f2937', marginBottom: 4 },
  sectionSub:   { fontSize: 12, color: '#4b5563', marginBottom: 12 },

  accordionBtn:     { width: '100%', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'right', gap: 8 },
  accordionTitle:   { fontSize: 15, fontWeight: 700, color: '#1f2937' },
  accordionSub:     { fontSize: 12, color: '#4b5563', marginTop: 2 },
  accordionRight:   { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  accordionArrow:   { fontSize: 12, color: '#6b7280' },
  accordionContent: { marginTop: 12 },

  clockBadge:     { background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: 8, padding: '4px 12px', fontSize: 14, fontWeight: 700, color: '#2563eb', flexShrink: 0 },
  transitLoading: { color: '#4b5563', fontSize: 13, padding: '12px 0' },

  routesWrap:   { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 },
  routeCard:    { background: '#f9fafb', borderRadius: 10, padding: '10px 14px', border: '1px solid #e5e7eb' },
  routeTop:     { display: 'flex', alignItems: 'center', gap: 12 },
  lineNum:      { fontSize: 13, fontWeight: 700, padding: '4px 10px', borderRadius: 8, flexShrink: 0 },
  routeName:    { fontSize: 14, fontWeight: 600, color: '#1f2937' },
  routeCompany: { fontSize: 11, color: '#4b5563', marginTop: 2 },
  routeType:    { fontSize: 11, color: '#6b7280', flexShrink: 0 },

  depsRow:      { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, paddingTop: 8, borderTop: '1px solid #e5e7eb' },
  depChip:      { display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '4px 10px', minWidth: 52 },
  depChipFirst: { background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.25)' },
  depTime:      { fontSize: 14, fontWeight: 700, color: '#1f2937' },
  depMin:       { fontSize: 10, color: '#4b5563', marginTop: 1 },
  noDepMsg:     { fontSize: 12, color: '#6b7280', marginTop: 8, paddingTop: 8, borderTop: '1px solid #e5e7eb' },

  stopsWrap:   { marginTop: 8 },
  stopsHeader: { fontSize: 12, color: '#4b5563', marginBottom: 8 },
  stopsList:   { display: 'flex', flexDirection: 'column', gap: 6 },
  stopItem:    { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 },
  stopDot:     { color: '#2563eb', fontSize: 8 },
  stopName:    { color: '#1f2937', fontWeight: 500 },
  stopCity:    { color: '#4b5563', fontSize: 12 },
  stopCode:    { color: '#2563eb', fontSize: 11, background: 'rgba(37,99,235,0.08)', padding: '1px 6px', borderRadius: 4 },
  noTransit:   { color: '#4b5563', fontSize: 13, padding: '8px 0' },

  hotspot:  { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f3f4f6' },
  rank:     { width: 28, height: 28, borderRadius: '50%', background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#2563eb', flexShrink: 0 },
  hsName:   { fontSize: 14, fontWeight: 600, color: '#1f2937' },
  hsDetail: { fontSize: 12, color: '#4b5563', marginTop: 2 },
  heat:     { fontSize: 12 },
};
