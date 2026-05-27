import { useState, useEffect } from 'react';
import Layout       from '../components/Layout.jsx';
import MapComponent from '../components/MapComponent.jsx';

const STAR_MAP = { 1: '⭐', 2: '⭐⭐', 3: '⭐⭐⭐', 4: '⭐⭐⭐⭐', 5: '⭐⭐⭐⭐⭐' };

export default function MapPage() {
  const [spots,  setSpots]  = useState([]);
  const [points, setPoints] = useState([]);

  useEffect(() => {
    fetch('/api/spots',  { credentials: 'include' })
      .then(r => r.json()).then(d => Array.isArray(d) && setSpots(d)).catch(() => {});
    fetch('/api/points', { credentials: 'include' })
      .then(r => r.json()).then(d => Array.isArray(d) && setPoints(d)).catch(() => {});
  }, []);

  return (
    <Layout>
      <MapComponent spots={spots} points={points} />

      <div style={s.panel}>
        <div style={s.panelHeader}>
          <div style={s.panelTitle}>📍 נקודות טרמפ קהילתיות</div>
          {spots.length > 0 && <div style={s.count}>{spots.length} נקודות</div>}
        </div>

        {spots.length === 0 ? (
          <div style={s.empty}>
            <div style={s.emptyIcon}>🗺</div>
            <div style={s.emptyText}>עוד אין נקודות קהילתיות</div>
            <div style={s.emptySub}>לחץ על "דווח טרמפ" כדי להיות הראשון!</div>
          </div>
        ) : (
          <div style={s.list}>
            {spots.map(spot => (
              <div key={spot.id} style={s.spotCard}>
                <div style={s.spotLeft}>
                  <div style={s.spotName}>{spot.name}</div>
                  <div style={s.spotMeta}>
                    <span style={s.city}>{spot.city}</span>
                    <span style={s.dot}>·</span>
                    <span style={s.dir}>{spot.direction}</span>
                    {spot.bestHours && <><span style={s.dot}>·</span><span style={s.hours}>{spot.bestHours}</span></>}
                  </div>
                </div>
                <div style={s.spotRight}>
                  <div style={s.stars}>{STAR_MAP[Math.round(spot.rating)] || ''}</div>
                  <div style={s.reports}>{spot.reports} דיווח{spot.reports !== 1 ? 'ים' : ''}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

const s = {
  panel:       { background: '#f8fafc', borderTop: '1px solid #e5e7eb', padding: '16px 16px 80px' },
  panelHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  panelTitle:  { fontSize: 15, fontWeight: 700, color: '#1f2937' },
  count:       { fontSize: 12, color: '#4b5563', background: '#e5e7eb', borderRadius: 12, padding: '2px 10px' },
  list:        { display: 'flex', flexDirection: 'column', gap: 10 },
  spotCard:    { background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  spotLeft:    { flex: 1, minWidth: 0 },
  spotName:    { fontSize: 15, fontWeight: 600, color: '#1f2937', marginBottom: 4 },
  spotMeta:    { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  city:        { fontSize: 12, color: '#4b5563' },
  dir:         { fontSize: 12, color: '#2563eb', fontWeight: 600 },
  hours:       { fontSize: 12, color: '#6b7280' },
  dot:         { fontSize: 10, color: '#d1d5db' },
  spotRight:   { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 },
  stars:       { fontSize: 11 },
  reports:     { fontSize: 10, color: '#9ca3af' },
  empty:       { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '32px 0', color: '#4b5563' },
  emptyIcon:   { fontSize: 36 },
  emptyText:   { fontSize: 15, fontWeight: 600, color: '#1f2937' },
  emptySub:    { fontSize: 13, textAlign: 'center' },
};
