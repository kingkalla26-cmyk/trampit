import { useEffect, useState } from 'react';

export default function Results({ data, origin, destination, carDest, onReset }) {
  const [transit, setTransit] = useState(null);
  const [transitLoading, setTransitLoading] = useState(false);

  useEffect(() => {
    if (!destination) return;
    setTransitLoading(true);
    fetch(`/api/transit?stop=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`)
      .then(r => r.json())
      .then(d => setTransit(d))
      .catch(() => setTransit(null))
      .finally(() => setTransitLoading(false));
  }, [origin, destination]);

  if (!data) return null;

  const typeConfig = {
    fast:  { label: '⚡ הכי מהיר',     color: '#0ea5e9' },
    cheap: { label: '₪ הכי זול',       color: '#34d399' },
    tramp: { label: '🤙 הכי קל לטרמפ', color: '#a78bfa' },
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
            const cfg = typeConfig[opt.type] || typeConfig.fast;
            return (
              <div key={i} style={{ ...s.optCard, ...(opt.best ? s.optBest : {}) }}>
                <span style={{ ...s.badge, background: cfg.color + '22', color: cfg.color, border: `1px solid ${cfg.color}44` }}>{cfg.label}</span>
                <div style={s.location}>{opt.location}</div>
                <div style={s.distance}>{opt.exitDistance} מהמוצא</div>
                <div style={s.stats}>
                  <div style={s.stat}><div style={s.statVal}>{opt.time}</div><div style={s.statLbl}>זמן</div></div>
                  <div style={s.stat}><div style={s.statVal}>{opt.cost}</div><div style={s.statLbl}>עלות</div></div>
                  <div style={s.stat}><div style={s.statVal}>{opt.trampScore}/10</div><div style={s.statLbl}>טרמפ</div></div>
                </div>
                <div style={s.tags}>
                  {(opt.transport || []).map((t, j) => <span key={j} style={s.tag}>{t}</span>)}
                </div>
                {opt.note && <div style={s.note}>💡 {opt.note}</div>}
              </div>
            );
          })}
        </div>

        {/* Real Transit Data */}
        <div style={s.section}>
          <div style={s.sectionTitle}>🚌 תחבורה ציבורית אמיתית</div>
          <div style={s.sectionSub}>מקור: ממשל פתוח ישראל + עמותת הסדנה</div>

          {transitLoading && <div style={s.transitLoading}>טוען נתוני תחבורה...</div>}

          {transit && !transitLoading && (
            <>
              {/* Routes */}
              {(transit.routes || []).length > 0 && (
                <div style={s.routesWrap}>
                  {transit.routes.map((r, i) => (
                    <div key={i} style={s.routeRow}>
                      <div style={{ ...s.lineNum, background: r.type === 'רכבת' ? 'rgba(250,204,21,0.15)' : 'rgba(79,158,255,0.15)', color: r.type === 'רכבת' ? '#facc15' : '#4f9eff', border: `1px solid ${r.type === 'רכבת' ? 'rgba(250,204,21,0.3)' : 'rgba(79,158,255,0.3)'}` }}>
                        {r.type === 'רכבת' ? '🚆' : '🚌'} {r.line}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={s.routeName}>{r.to}</div>
                        {r.company && <div style={s.routeCompany}>{r.company}</div>}
                      </div>
                      <div style={s.routeType}>{r.type}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Stops */}
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

        {/* AI Insight */}
        {data.aiInsight && (
          <div style={s.insight}>
            <div style={s.insightHeader}>✦ תובנת AI</div>
            <p style={s.insightText}>{data.aiInsight}</p>
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  container: { padding: '0 16px 80px' },
  card: { background: '#161a22', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20 },
  header: { display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  title: { fontSize: 17, fontWeight: 700, color: '#f0f2f7' },
  sub: { fontSize: 13, color: '#7a8499', marginTop: 2 },
  aiBadge: { fontSize: 11, color: '#4f9eff', background: 'rgba(79,158,255,0.1)', border: '1px solid rgba(79,158,255,0.25)', padding: '3px 10px', borderRadius: 20 },
  resetBtn: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 14px', color: '#f0f2f7', cursor: 'pointer', fontSize: 13, fontFamily: 'Heebo, sans-serif', marginRight: 'auto' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 },
  optCard: { background: '#1e2330', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 },
  optBest: { border: '1px solid rgba(79,158,255,0.4)', boxShadow: '0 0 0 1px rgba(79,158,255,0.15)' },
  badge: { fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, alignSelf: 'flex-start' },
  location: { fontSize: 18, fontWeight: 700, color: '#f0f2f7' },
  distance: { fontSize: 12, color: '#7a8499' },
  stats: { display: 'flex', gap: 8 },
  stat: { flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 6px', textAlign: 'center' },
  statVal: { fontSize: 14, fontWeight: 700, color: '#f0f2f7' },
  statLbl: { fontSize: 10, color: '#7a8499', marginTop: 2 },
  tags: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  tag: { fontSize: 11, background: 'rgba(79,158,255,0.1)', color: '#4f9eff', border: '1px solid rgba(79,158,255,0.2)', padding: '3px 8px', borderRadius: 6 },
  note: { fontSize: 12, color: '#7a8499', background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 10px' },
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 15, fontWeight: 700, color: '#f0f2f7', marginBottom: 4 },
  sectionSub: { fontSize: 12, color: '#7a8499', marginBottom: 12 },
  transitLoading: { color: '#7a8499', fontSize: 13, padding: '12px 0' },
  routesWrap: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 },
  routeRow: { display: 'flex', alignItems: 'center', gap: 12, background: '#1e2330', borderRadius: 10, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.06)' },
  lineNum: { fontSize: 13, fontWeight: 700, padding: '4px 10px', borderRadius: 8, flexShrink: 0 },
  routeName: { fontSize: 14, fontWeight: 600, color: '#f0f2f7' },
  routeCompany: { fontSize: 11, color: '#7a8499', marginTop: 2 },
  routeType: { fontSize: 11, color: '#7a8499', flexShrink: 0 },
  stopsWrap: { marginTop: 8 },
  stopsHeader: { fontSize: 12, color: '#7a8499', marginBottom: 8 },
  stopsList: { display: 'flex', flexDirection: 'column', gap: 6 },
  stopItem: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 },
  stopDot: { color: '#4f9eff', fontSize: 8 },
  stopName: { color: '#f0f2f7', fontWeight: 500 },
  stopCity: { color: '#7a8499', fontSize: 12 },
  stopCode: { color: '#4f9eff', fontSize: 11, background: 'rgba(79,158,255,0.08)', padding: '1px 6px', borderRadius: 4 },
  noTransit: { color: '#7a8499', fontSize: 13, padding: '8px 0' },
  hotspot: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' },
  rank: { width: 28, height: 28, borderRadius: '50%', background: '#1e2330', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#4f9eff', flexShrink: 0 },
  hsName: { fontSize: 14, fontWeight: 600, color: '#f0f2f7' },
  hsDetail: { fontSize: 12, color: '#7a8499', marginTop: 2 },
  heat: { fontSize: 12 },
  insight: { marginTop: 20, background: 'rgba(79,158,255,0.06)', border: '1px solid rgba(79,158,255,0.15)', borderRadius: 12, padding: 16 },
  insightHeader: { fontSize: 13, fontWeight: 700, color: '#4f9eff', marginBottom: 8 },
  insightText: { fontSize: 14, color: '#cbd5e1', lineHeight: 1.6 },
};
