import { useState, useEffect } from 'react';
import Layout       from '../components/Layout.jsx';
import MapComponent from '../components/MapComponent.jsx';

const STAR_MAP = { 1: '⭐', 2: '⭐⭐', 3: '⭐⭐⭐', 4: '⭐⭐⭐⭐', 5: '⭐⭐⭐⭐⭐' };

export default function MapPage() {
  const [spots,    setSpots]    = useState([]);
  const [points,   setPoints]   = useState([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch('/api/spots',  { credentials: 'include' })
      .then(r => r.json()).then(d => Array.isArray(d) && setSpots(d)).catch(() => {});
    fetch('/api/points', { credentials: 'include' })
      .then(r => r.json()).then(d => Array.isArray(d) && setPoints(d)).catch(() => {});
  }, []);

  const panelH = expanded ? '58vh' : 170;

  return (
    <Layout mapMode>
      {/* מפה — ממלאת את כל השטח הנותר */}
      <div style={s.mapWrap}>
        <MapComponent spots={spots} points={points} />
      </div>

      {/* פאנל תחתון — ניתן להרחבה */}
      <div style={{ ...s.panel, height: panelH }}>

        {/* ידית + כותרת — לחיצה מרחיבה/מצמצמת */}
        <div style={s.handle} onClick={() => setExpanded(e => !e)}>
          <div style={s.bar} />
          <div style={s.header}>
            <span style={s.title}>📍 נקודות טרמפ קהילתיות</span>
            <div style={s.headerRight}>
              {spots.length > 0 && <span style={s.badge}>{spots.length}</span>}
              <span style={s.chevron}>{expanded ? '▼' : '▲'}</span>
            </div>
          </div>
        </div>

        {/* תוכן גלילה */}
        <div style={s.scroll}>
          {spots.length === 0 ? (
            <div style={s.empty}>
              <div style={{ fontSize: 32 }}>🗺</div>
              <div style={s.emptyTitle}>עוד אין נקודות קהילתיות</div>
              <div style={s.emptySub}>לחץ על "דווח טרמפ" להיות הראשון!</div>
            </div>
          ) : (
            <div style={s.list}>
              {spots.map(spot => (
                <div key={spot.id} style={s.card}>
                  <div style={s.cardLeft}>
                    <div style={s.cardName}>{spot.name}</div>
                    <div style={s.cardMeta}>
                      <span style={s.city}>{spot.city}</span>
                      <span style={s.sep}>·</span>
                      <span style={s.dir}>{spot.direction}</span>
                      {spot.bestHours && <><span style={s.sep}>·</span><span style={s.hours}>{spot.bestHours}</span></>}
                    </div>
                  </div>
                  <div style={s.cardRight}>
                    {spot.rating > 0 && <div style={s.stars}>{STAR_MAP[Math.round(spot.rating)]}</div>}
                    <div style={s.reps}>{spot.reports} דיווח{spot.reports !== 1 ? 'ים' : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

const s = {
  mapWrap:    { flex: 1, minHeight: 0, position: 'relative' },
  panel: {
    flexShrink: 0,
    display: 'flex', flexDirection: 'column',
    background: '#ffffff',
    borderTop: '1px solid #e5e7eb',
    transition: 'height 0.28s cubic-bezier(0.4,0,0.2,1)',
    overflow: 'hidden',
  },
  handle:     { padding: '8px 16px 0', cursor: 'pointer', userSelect: 'none', flexShrink: 0 },
  bar:        { width: 36, height: 4, borderRadius: 2, background: '#d1d5db', margin: '0 auto 10px' },
  header:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title:      { fontSize: 14, fontWeight: 700, color: '#1f2937' },
  headerRight:{ display: 'flex', alignItems: 'center', gap: 8 },
  badge:      { fontSize: 11, color: '#6b7280', background: '#f3f4f6', borderRadius: 10, padding: '1px 8px' },
  chevron:    { fontSize: 10, color: '#9ca3af' },
  scroll:     { flex: 1, overflowY: 'auto', padding: '0 16px 80px' },
  empty:      { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '24px 0', color: '#6b7280' },
  emptyTitle: { fontSize: 14, fontWeight: 600, color: '#1f2937' },
  emptySub:   { fontSize: 12, textAlign: 'center' },
  list:       { display: 'flex', flexDirection: 'column', gap: 8 },
  card:       { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cardLeft:   { flex: 1, minWidth: 0 },
  cardName:   { fontSize: 14, fontWeight: 600, color: '#1f2937', marginBottom: 3 },
  cardMeta:   { display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  city:       { fontSize: 11, color: '#6b7280' },
  sep:        { fontSize: 10, color: '#d1d5db' },
  dir:        { fontSize: 11, color: '#2563eb', fontWeight: 600 },
  hours:      { fontSize: 11, color: '#9ca3af' },
  cardRight:  { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 },
  stars:      { fontSize: 11 },
  reps:       { fontSize: 10, color: '#9ca3af' },
};
